/**
 * O fallback offline: a venda de um contato SEM anúncio nem clique é reportada
 * às duas plataformas que a organização tiver ligadas, identificada por dado em
 * hash (telefone na Meta; e-mail ou telefone no Google).
 *
 * ─── Por que um livro-razão próprio por plataforma ─────────────────────────
 *
 * `ad_conversion_dispatches` é único por (org, lead, `event_name`). A venda com
 * origem grava `Purchase` e uma venda sem origem não pode disputar essa linha
 * — e como as duas plataformas recebem a MESMA venda, cada uma precisa da sua
 * linha. O `event_name` ganha o prefixo `SemOrigem:<plataforma>:Purchase`: a
 * unicidade já separa as duas, sem migration. O transporte continua mandando
 * `Purchase` no fio; o prefixo é só a chave do livro-razão.
 *
 * ─── Sem conexão, sem linha ───────────────────────────────────────────────
 *
 * Plataforma que a organização NÃO liga não grava nada: não há pendência, havia
 * nada a reportar. Gravar `sem_conexao` para cada venda orgânica encheria a tela
 * de ruído (mesma régua de `envio.handler.ts`).
 *
 * ⚠️ O OPT-IN mora em `organizations.settings.conversions.enviar_sem_origem`,
 * desligado por padrão, e é lido ANTES de qualquer coisa — nada sai sem ele.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { enviarSemOrigemLigado } from "@/lib/conversoes/enviar-sem-origem";
import { lerRegistro, registraEnvio } from "@/lib/conversoes/registro-de-envio";
import { lerCredencial } from "@/lib/plataformas-de-anuncio/credenciais";
import { transporteDe } from "@/lib/plataformas-de-anuncio/registry";
import type {
  ConversaoOffline,
  NomeDoEvento,
  PlataformaDeAnuncio,
} from "@/lib/plataformas-de-anuncio/types";

/** As plataformas que recebem a venda sem origem. A ordem é a do registro. */
export const PLATAFORMAS_SEM_ORIGEM: readonly PlataformaDeAnuncio[] = ["meta_ads", "google_ads"];

export type PlataformaSemOrigem = (typeof PLATAFORMAS_SEM_ORIGEM)[number];

/** A chave do livro-razão de uma plataforma para a venda sem origem. */
export function eventoSemOrigem(plataforma: PlataformaDeAnuncio): NomeDoEvento {
  return `SemOrigem:${plataforma}:Purchase`;
}

/** Recupera a plataforma dona de um pedido de reenvio, sem aceitar variantes. */
export function plataformaSemOrigemDoEvento(evento: unknown): PlataformaSemOrigem | null {
  return (
    PLATAFORMAS_SEM_ORIGEM.find((plataforma) => evento === eventoSemOrigem(plataforma)) ?? null
  );
}

/** Lê o opt-in. LANÇA quando a leitura falha: quem chama espera e tenta de novo. */
export async function lerEnviarSemOrigem(
  admin: SupabaseClient,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`leitura do opt-in falhou: ${error.message}`);
  return enviarSemOrigemLigado((data as { settings?: unknown } | null)?.settings);
}

export interface VendaSemOrigem {
  organizationId: string;
  leadId: string;
  valorCentavos: number | null;
  moeda: string | null;
  ocorridoEm: Date;
  telefone: string | null;
  email: string | null;
}

export type DesfechoSemOrigem = {
  plataforma: PlataformaDeAnuncio;
  status: "sent" | "skipped" | "retry";
  motivo: string | null;
};

/** Reporta a venda a cada plataforma ligada. Uma falha não impede a outra. */
export async function reportarVendaSemOrigem(
  admin: SupabaseClient,
  venda: VendaSemOrigem,
  apenasPlataforma?: PlataformaSemOrigem,
): Promise<DesfechoSemOrigem[]> {
  const desfechos: DesfechoSemOrigem[] = [];
  const plataformas = apenasPlataforma ? [apenasPlataforma] : PLATAFORMAS_SEM_ORIGEM;
  for (const plataforma of plataformas) {
    desfechos.push(await umaPlataforma(admin, venda, plataforma));
  }
  return desfechos;
}

async function umaPlataforma(
  admin: SupabaseClient,
  venda: VendaSemOrigem,
  plataforma: PlataformaDeAnuncio,
): Promise<DesfechoSemOrigem> {
  const evento = eventoSemOrigem(plataforma);
  const { organizationId: org, leadId } = venda;

  const registro = await lerRegistro(admin, org, leadId, evento);
  if (registro?.status === "sent") return { plataforma, status: "skipped", motivo: "ja_enviada" };

  // Sem conexão, a plataforma não entra na tela: não havia o que reportar.
  const credencial = await lerCredencial(admin, org, plataforma, { exigirAcaoDeVenda: true });
  if (!credencial.ok) {
    if (credencial.motivo === "leitura_indisponivel")
      throw new Error("Leitura da conexão indisponível.");
    return { plataforma, status: "skipped", motivo: credencial.motivo };
  }

  const registra = (
    status: "sent" | "skipped" | "error",
    motivo: string | null,
    detalhe?: string,
  ) =>
    registraEnvio(admin, {
      organizationId: org,
      leadId,
      plataforma,
      evento,
      status,
      motivo,
      eventoId: `${leadId}:Purchase`,
      valorCentavos: venda.valorCentavos,
      moeda: venda.moeda,
      detalhe: detalhe ?? null,
    });

  // A Meta casa pelo telefone (`ph`). O Google casa pelo e-mail ou pelo telefone.
  const temIdentificador =
    plataforma === "meta_ads" ? Boolean(venda.telefone) : Boolean(venda.email || venda.telefone);
  if (!temIdentificador) {
    await registra("skipped", "sem_identificador");
    return { plataforma, status: "skipped", motivo: "sem_identificador" };
  }

  // Compra sem valor: a Meta exige valor; o Google segue o modo da organização.
  const modoDeValor =
    plataforma === "google_ads"
      ? (credencial.credencial.google?.modoDeValorDaVenda ?? "obrigatorio")
      : "obrigatorio";
  if (venda.valorCentavos === null && modoDeValor === "obrigatorio") {
    await registra("skipped", "sem_valor");
    return { plataforma, status: "skipped", motivo: "sem_valor" };
  }

  const transporte = transporteDe(plataforma);
  if (!transporte) return { plataforma, status: "skipped", motivo: "plataforma_sem_transporte" };

  const conversao: ConversaoOffline = {
    organizationId: org,
    leadId,
    evento: "Purchase",
    eventoId: `${leadId}:Purchase`,
    ocorridoEm: venda.ocorridoEm,
    cliqueDeOrigem: "",
    telefone: venda.telefone,
    emailDoContato: venda.email,
    moeda: venda.moeda ?? "BRL",
    valorCentavos: modoDeValor === "nunca" ? null : venda.valorCentavos,
    eventoNaPlataforma: null,
  };

  const resultado = await transporte.enviar(credencial.credencial, conversao);

  if (resultado.tipo === "ok") {
    if (credencial.credencial.testEventCode) {
      await registra(
        "skipped",
        "evento_de_teste",
        "Evento recebido em modo de teste. Desative o teste antes de reportar a venda real.",
      );
      return { plataforma, status: "skipped", motivo: "evento_de_teste" };
    }
    await registra("sent", null, resultado.detalhe);
    return { plataforma, status: "sent", motivo: null };
  }

  if (resultado.tipo === "permanente") {
    await registra("error", "recusado_pela_plataforma", resultado.detalhe);
    return { plataforma, status: "skipped", motivo: "recusado_pela_plataforma" };
  }

  // Transitório e processamento: a tentativa seguinte reenvia, e a plataforma
  // descarta a cópia pelo `eventoId` (a mesma chave de deduplicação da venda).
  await registra("skipped", "nova_tentativa_agendada", resultado.detalhe);
  return { plataforma, status: "retry", motivo: "nova_tentativa_agendada" };
}

/**
 * Lê telefone e e-mail do contato, FILTRANDO a organização: o client é
 * service-role. O telefone sai só com dígitos, pelo mesmo motivo de
 * `leitura-da-atribuicao.ts`: o hash precisa ser do número já normalizado.
 */
export async function lerContatoSemOrigem(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<{ telefone: string | null; email: string | null } | null> {
  const { data, error } = await admin
    .from("contacts")
    .select("phone_number, email")
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler o contato da venda.");
  if (!data) return null;
  const linha = data as { phone_number: string | null; email: string | null };
  return {
    telefone: linha.phone_number ? linha.phone_number.replace(/\D/g, "") || null : null,
    email: linha.email?.trim() || null,
  };
}
