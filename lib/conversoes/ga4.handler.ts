/**
 * O consumidor das conversões do GA4 (9002).
 *
 * O GA4 é DESTINO, não origem: não depende de qual anúncio trouxe o contato,
 * e sim de o CRM ter capturado o `client_id` do visitante no site
 * (`ga4/identidade.ts`). Por isso tem consumidor próprio em vez de entrar no
 * `envio.handler.ts`, que é guiado pela atribuição.
 *
 * Travas, na ordem: já enviada não sai de novo; movimento anterior à regra não
 * envia (`configured_at`); etapa precisa ser desta organização e não ser de
 * ganho (o ganho é a venda, que tem caminho próprio) — etapa de PERDA dispara,
 * é onde mora o `close_unconvert_lead`; sem conexão ou sem identidade não grava
 * linha — feature desligada não polui o Histórico. O reenvio usa o RETRATO
 * gravado (quando e qual evento).
 *
 * O evento da venda segue o objetivo do funil do negócio
 * (`crm_pipelines.settings.objetivo`): vender produto → `purchase`, os demais →
 * `close_convert_lead`. Funil sem objetivo cai no padrão da conexão
 * (`ga4_won_event`).
 */
import { z } from "zod";
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { lerObjetivoDoFunil } from "@/lib/onboarding/perfil-de-negocio";
import { lerCredencialGa4 } from "@/lib/plataformas-de-anuncio/ga4/credencial";
import { lerIdentidadeGa4 } from "@/lib/plataformas-de-anuncio/ga4/identidade";
import { enviarEventoGa4 } from "@/lib/plataformas-de-anuncio/ga4/measurement-protocol";
import type { NomeDoEvento } from "@/lib/plataformas-de-anuncio/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { eventoDaVendaDoObjetivo } from "./mapa-de-eventos-ga4";
import { lerRegistro, registraEnvio } from "./registro-de-envio";
import { EVENTO_DE_VENDA_GA4, ehEventoDeEtapaGa4, lerRegraGa4DaEtapa } from "./regras-ga4";

const KEY = "conversoes.ga4";
const ESPERA_MS = 300_000;
type Admin = ReturnType<typeof createAdminClient>;

const pula = (detail: string): HandlerResult => ({ consumer_key: KEY, status: "skipped", detail });
const deNovo = (detail: string): HandlerResult => ({
  consumer_key: KEY,
  status: "retry",
  retry_at: new Date(Date.now() + ESPERA_MS).toISOString(),
  detail,
});

interface Lead {
  id: string;
  status: string;
  value_cents: number | null;
  currency: string | null;
  closed_at: string | null;
  contact_id: string | null;
  pipeline_id: string | null;
}

interface Alvo {
  evento: NomeDoEvento;
  nome: string | null; // null = venda: o nome vem da credencial
  ocorridoEm: string;
  venda: boolean;
}

async function lerLead(admin: Admin, org: string, id: string): Promise<Lead | null> {
  const { data, error } = await admin
    .from("crm_leads")
    .select("id, status, value_cents, currency, closed_at, contact_id, pipeline_id")
    .eq("organization_id", org)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Lead | null) ?? null;
}

/** Etapa desta organização que não é de ganho. Etapa de perda dispara. */
async function etapaQueDispara(admin: Admin, org: string, stageId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("crm_stages")
    .select("id")
    .eq("organization_id", org)
    .eq("id", stageId)
    .eq("is_won", false)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** O evento da venda pelo objetivo do funil do negócio; `null` = padrão da conexão. */
async function eventoDaVendaDoFunil(admin: Admin, org: string, pipelineId: string | null): Promise<string | null> {
  if (!pipelineId) return null;
  const { data, error } = await admin
    .from("crm_pipelines")
    .select("settings")
    .eq("organization_id", org)
    .eq("id", pipelineId)
    .maybeSingle();
  if (error) throw error;
  const settings = (data as { settings?: unknown } | null)?.settings;
  return eventoDaVendaDoObjetivo(lerObjetivoDoFunil(settings));
}

async function alvoDoEvento(admin: Admin, row: EventRow, lead: Lead): Promise<Alvo | string> {
  if (row.event_type === "ad_conversion.retry_requested") {
    const evento = row.payload.event_name;
    if (evento !== EVENTO_DE_VENDA_GA4 && !ehEventoDeEtapaGa4(evento)) return "outro_evento";
    const reg = await lerRegistro(admin, row.organization_id, lead.id, evento);
    if (!reg?.event_occurred_at || !reg.ga4_event_name) return "sem_registro";
    return { evento, nome: reg.ga4_event_name, ocorridoEm: reg.event_occurred_at, venda: evento === EVENTO_DE_VENDA_GA4 };
  }
  if (lead.status === "won") {
    return { evento: EVENTO_DE_VENDA_GA4, nome: null, ocorridoEm: lead.closed_at ?? row.created_at ?? new Date().toISOString(), venda: true };
  }
  if (row.event_type !== "lead.stage_changed") return "outro_evento";
  const etapa = z.uuid().safeParse(row.payload.to_stage_id);
  if (!etapa.success || !row.created_at) return "sem_etapa_ou_data";
  const regra = await lerRegraGa4DaEtapa(admin, row.organization_id, etapa.data);
  if (!regra || !regra.enabled || !ehEventoDeEtapaGa4(regra.eventName)) return "etapa_sem_regra_ga4";
  if (Date.parse(row.created_at) < Date.parse(regra.configuredAt)) return "anterior_a_configuracao";
  if (!(await etapaQueDispara(admin, row.organization_id, etapa.data))) return "etapa_invalida";
  return { evento: regra.eventName, nome: regra.ga4Event, ocorridoEm: row.created_at, venda: false };
}

async function handle(row: EventRow): Promise<HandlerResult> {
  if (!row.entity_id) return pula("sem_entidade");

  const admin = createAdminClient();
  try {
    const lead = await lerLead(admin, row.organization_id, row.entity_id);
    if (!lead) return pula("sem_lead");
    const alvo = await alvoDoEvento(admin, row, lead);
    if (typeof alvo === "string") return pula(alvo);

    const registro = await lerRegistro(admin, row.organization_id, lead.id, alvo.evento);
    if (registro?.status === "sent") return pula("ja_enviada");

    const cred = await lerCredencialGa4(admin, row.organization_id);
    if (!cred.ok) return pula(cred.motivo);

    if (!lead.contact_id) return pula("sem_identidade_ga4");
    const { data: contato, error } = await admin
      .from("contacts")
      .select("source_metadata")
      .eq("organization_id", row.organization_id)
      .eq("id", lead.contact_id)
      .maybeSingle();
    if (error) throw error;
    const identidade = lerIdentidadeGa4((contato as { source_metadata?: unknown } | null)?.source_metadata);
    if (!identidade) return pula("sem_identidade_ga4");

    // Reenvio já traz o retrato (`alvo.nome`); só a venda nova consulta o funil.
    const nome =
      alvo.nome ??
      (await eventoDaVendaDoFunil(admin, row.organization_id, lead.pipeline_id)) ??
      cred.credencial.wonEvent;
    const valor = alvo.venda ? lead.value_cents : null;
    const moeda = alvo.venda ? lead.currency : null;
    const resultado = await enviarEventoGa4(cred.credencial, {
      nome,
      identidade,
      ocorridoEm: new Date(alvo.ocorridoEm),
      valorCentavos: valor,
      moeda,
      transactionId: alvo.venda && nome === "purchase" ? lead.id : null,
    });

    const ok = resultado.tipo === "ok";
    await registraEnvio(admin, {
      organizationId: row.organization_id,
      leadId: lead.id,
      plataforma: "ga4",
      evento: alvo.evento,
      status: ok ? "sent" : "error",
      motivo: ok ? null : resultado.tipo,
      eventoId: `${lead.id}:${alvo.evento}`,
      valorCentavos: valor,
      moeda,
      detalhe: "detalhe" in resultado ? (resultado.detalhe ?? null) : null,
      ocorridoEm: alvo.ocorridoEm,
      ga4EventName: nome,
    });
    if (resultado.tipo === "transitorio") return deNovo("GA4 indisponível. Nova tentativa agendada.");
    return { consumer_key: KEY, status: ok ? "ok" : "skipped", detail: ok ? "enviada" : resultado.tipo };
  } catch {
    return deNovo("Não foi possível processar a conversão do GA4. Nova tentativa agendada.");
  }
}

export const conversaoGa4Handler: EventHandler = {
  key: KEY,
  naOrgParada: "pula",
  events: ["lead.won", "lead.stage_changed", "ad_conversion.retry_requested"],
  handle,
};
