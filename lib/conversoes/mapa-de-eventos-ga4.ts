/**
 * Qual evento do GA4 cada etapa do funil SUGERE, a partir do passo canônico da
 * etapa (`crm_stages.agent_stage_hint`) e do objetivo do funil
 * (`crm_pipelines.settings.objetivo`).
 *
 * É sugestão, não regra: a tela de Conversões mostra o resultado pré-marcado e
 * só grava o que a pessoa confirmar. O passo é a chave porque é estável —
 * renomear a coluna "Aguardando pagamento" não muda o que ela significa.
 *
 * Fonte: tabela "Jornada do comprador × eventos" aprovada pelo dono em
 * 2026-10-07 (docs/superpowers/specs/2026-10-07-perfil-de-negocio-e-eventos-design.md).
 */
import type { LeadStage } from "@/lib/agent-engine/agent/lead-state";
import type { EventoDeEtapaGa4, EventoDeVendaGa4 } from "@/lib/conversoes/regras-ga4";
import type { ObjetivoDoNegocio } from "@/lib/onboarding/perfil-de-negocio";

type Jornada = Readonly<Partial<Record<LeadStage, EventoDeEtapaGa4>>>;

const JORNADA_DE_LEAD: Jornada = {
  new: "generate_lead",
  qualifying: "working_lead",
  qualified: "qualify_lead",
  lost: "close_unconvert_lead",
};

const JORNADA: Readonly<Record<ObjetivoDoNegocio, Jornada>> = {
  vender_produto: {
    new: "generate_lead",
    qualifying: "view_item",
    qualified: "add_to_cart",
    negotiating: "begin_checkout",
    lost: "close_unconvert_lead",
  },
  vender_servico: { ...JORNADA_DE_LEAD, negotiating: "begin_checkout" },
  agendar: { ...JORNADA_DE_LEAD, negotiating: "schedule" },
  captar_lead: JORNADA_DE_LEAD,
};

/** Funil sem objetivo é tratado como funil de leads. Etapa sem passo: sem sugestão. */
export function eventoDeEtapaSugerido(
  objetivo: ObjetivoDoNegocio | null,
  passo: LeadStage | null,
): EventoDeEtapaGa4 | null {
  if (!passo) return null;
  return (objetivo ? JORNADA[objetivo] : JORNADA_DE_LEAD)[passo] ?? null;
}

/**
 * O evento da venda pelo objetivo do funil do negócio. `null` = funil sem
 * objetivo: quem decide é o padrão da conexão (`ad_platform_connections.ga4_won_event`).
 */
export function eventoDaVendaDoObjetivo(
  objetivo: ObjetivoDoNegocio | null,
): EventoDeVendaGa4 | null {
  if (!objetivo) return null;
  return objetivo === "vender_produto" ? "purchase" : "close_convert_lead";
}
