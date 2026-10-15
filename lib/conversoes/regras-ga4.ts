/**
 * As regras de conversão do GA4 por ETAPA do funil (migration 9002), e o
 * vocabulário de eventos que o CRM manda ao GA4.
 *
 * Par de `regras-meta.ts`. Duas diferenças que vêm do GA4: os nomes são os
 * eventos RECOMENDADOS de geração de lead (snake_case, minúsculos), e a venda
 * não é uma regra de etapa — é escolhida na conexão (`ga4_won_event`).
 *
 * O CHECK da tabela repete a lista como segunda linha de defesa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const EVENTOS_DE_ETAPA_DO_GA4 = [
  { valor: "generate_lead", rotulo: "Lead gerado" },
  { valor: "qualify_lead", rotulo: "Lead qualificado" },
  { valor: "working_lead", rotulo: "Lead em atendimento" },
  { valor: "begin_checkout", rotulo: "Início de compra (orçamento)" },
] as const;

export type EventoDeEtapaGa4 = (typeof EVENTOS_DE_ETAPA_DO_GA4)[number]["valor"];

export const VALORES_DE_EVENTO_DE_ETAPA_GA4 = EVENTOS_DE_ETAPA_DO_GA4.map((e) => e.valor) as [
  EventoDeEtapaGa4,
  ...EventoDeEtapaGa4[],
];

export const EVENTOS_DE_VENDA_DO_GA4 = [
  { valor: "close_convert_lead", rotulo: "Lead convertido (funil de leads)" },
  { valor: "purchase", rotulo: "Compra (e-commerce)" },
] as const;

export type EventoDeVendaGa4 = (typeof EVENTOS_DE_VENDA_DO_GA4)[number]["valor"];

export const VALORES_DE_EVENTO_DE_VENDA_GA4 = EVENTOS_DE_VENDA_DO_GA4.map((e) => e.valor) as [
  EventoDeVendaGa4,
  ...EventoDeVendaGa4[],
];

export function ehEventoDeEtapaDoGa4(valor: unknown): valor is EventoDeEtapaGa4 {
  return (
    typeof valor === "string" &&
    (VALORES_DE_EVENTO_DE_ETAPA_GA4 as readonly string[]).includes(valor)
  );
}

export function ehEventoDeVendaDoGa4(valor: unknown): valor is EventoDeVendaGa4 {
  return (
    typeof valor === "string" &&
    (VALORES_DE_EVENTO_DE_VENDA_GA4 as readonly string[]).includes(valor)
  );
}

export function rotuloDoEventoDoGa4(valor: string): string {
  return (
    [...EVENTOS_DE_ETAPA_DO_GA4, ...EVENTOS_DE_VENDA_DO_GA4].find((e) => e.valor === valor)
      ?.rotulo ?? valor
  );
}

/** Chave da venda no livro-razão — distinta de `Purchase` (Meta/Google). */
export const EVENTO_DE_VENDA_GA4 = "GA4:Venda" as const;

const PADRAO_DO_EVENTO_DE_ETAPA_GA4 = /^GA4Etapa:[0-9a-f-]{36}$/;

export function eventoDaEtapaGa4(stageId: string): `GA4Etapa:${string}` {
  return `GA4Etapa:${stageId}`;
}

export function ehEventoDeEtapaGa4(nome: unknown): nome is `GA4Etapa:${string}` {
  return typeof nome === "string" && PADRAO_DO_EVENTO_DE_ETAPA_GA4.test(nome);
}

export interface RegraDeConversaoGa4 {
  id: string;
  stageId: string;
  eventName: string;
  ga4Event: EventoDeEtapaGa4;
  enabled: boolean;
  configuredAt: string;
}

interface LinhaDaRegra {
  id: string;
  stage_id: string;
  event_name: string;
  ga4_event: string;
  enabled: boolean;
  configured_at: string;
}

const COLUNAS = "id, stage_id, event_name, ga4_event, enabled, configured_at";

function paraRegra(l: LinhaDaRegra): RegraDeConversaoGa4 | null {
  if (!ehEventoDeEtapaDoGa4(l.ga4_event)) return null;
  return {
    id: l.id,
    stageId: l.stage_id,
    eventName: l.event_name,
    ga4Event: l.ga4_event,
    enabled: l.enabled,
    configuredAt: l.configured_at,
  };
}

export async function listarRegrasGa4(
  admin: SupabaseClient,
  organizationId: string,
): Promise<RegraDeConversaoGa4[]> {
  const { data, error } = await admin
    .from("ga4_conversion_rules")
    .select(COLUNAS)
    .eq("organization_id", organizationId);
  if (error) throw new Error("Não foi possível ler as regras de conversão do GA4.");
  return ((data ?? []) as LinhaDaRegra[])
    .map(paraRegra)
    .filter((r): r is RegraDeConversaoGa4 => r !== null);
}

export async function lerRegraGa4DaEtapa(
  admin: SupabaseClient,
  organizationId: string,
  stageId: string,
): Promise<RegraDeConversaoGa4 | null> {
  const { data, error } = await admin
    .from("ga4_conversion_rules")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("stage_id", stageId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler a regra de conversão do GA4 da etapa.");
  return data ? paraRegra(data as LinhaDaRegra) : null;
}
