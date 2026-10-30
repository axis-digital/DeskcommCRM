import { MOEDA_PADRAO, formatCents } from "@/lib/money";
import type { TimelineItemDoContato } from "@/lib/types/contacts";

/**
 * Os eventos do site (`site_events`, migration 9902) na linha do tempo do contato.
 *
 * Diferente do pedido, que é projetado de `orders`, estes têm tabela própria porque
 * não existe fonte de origem para eles. Entram na MESMA rota e no MESMO formato de
 * item (`TimelineItemDoContato`, sem negócio), então a tela só precisa saber
 * escrever a linha. Puro de propósito (sem banco, sem React).
 */

export const TIPOS_DE_EVENTO_DO_SITE = ["cadastro", "carrinho_adicionado", "checkout_iniciado", "carrinho_abandonado"] as const;
export type TipoDeEventoDoSite = (typeof TIPOS_DE_EVENTO_DO_SITE)[number];

export const EVENTO_COLS = "id, organization_id, contact_id, kind, source, occurred_at, ga_client_id, ga_session_id, payload";

/** O que a rota lê de `site_events` (o retorno de `EVENTO_COLS`). */
export interface EventoDoSiteLido {
  id: string;
  organization_id: string;
  contact_id: string | null;
  kind: TipoDeEventoDoSite;
  source: string;
  occurred_at: string;
  ga_client_id: string | null;
  ga_session_id: string | null;
  payload: Record<string, unknown>;
}

const ROTULOS: Record<TipoDeEventoDoSite, string> = {
  cadastro: "Cadastro na loja",
  carrinho_adicionado: "Adicionou ao carrinho",
  checkout_iniciado: "Iniciou o checkout",
  carrinho_abandonado: "Carrinho abandonado",
};

export function ehEventoDoSite(item: { type: string }): boolean {
  return (TIPOS_DE_EVENTO_DO_SITE as readonly string[]).includes(item.type);
}

export function eventoDoSiteParaItemDaTimeline(e: EventoDoSiteLido): TimelineItemDoContato {
  const ga: Record<string, unknown> = {};
  if (e.ga_client_id) ga.ga_client_id = e.ga_client_id;
  if (e.ga_session_id) ga.ga_session_id = e.ga_session_id;
  return {
    id: e.id,
    organization_id: e.organization_id,
    // O evento do site não pertence a negócio; é por isso que a rota o lê à parte.
    lead_id: null,
    contact_id: e.contact_id,
    source_module: e.source,
    source_id: e.id,
    type: e.kind,
    payload: e.payload,
    metadata: ga,
    performed_at: e.occurred_at,
    performed_by_user_id: null,
    // Quem fez foi a pessoa da ficha; nomeá-la seria repetir o título da página.
    actor_kind: "contact",
    actor_agent_id: null,
    reason: null,
    evidence: null,
    actor_agent_name: null,
    actor_user_name: null,
  };
}

export function rotuloDoEventoDoSite(kind: string): string {
  return ROTULOS[kind as TipoDeEventoDoSite] ?? kind;
}

/** "R$ 291,35 · 7 itens". Cadastro não tem corpo: o rótulo já diz tudo. */
export function corpoDoEventoDoSite(
  kind: string,
  payload: Record<string, unknown>,
  t: (texto: string) => string = (texto) => texto,
): string {
  if (kind === "cadastro") return "";
  const total = typeof payload.total_cents === "number" && Number.isFinite(payload.total_cents) ? payload.total_cents : null;
  const moeda = typeof payload.currency === "string" && payload.currency.trim() !== "" ? payload.currency : MOEDA_PADRAO;
  const itens = typeof payload.itens === "number" && payload.itens > 0 ? payload.itens : null;
  const partes = [
    total !== null ? formatCents(total, moeda) : null,
    itens !== null ? `${itens} ${itens === 1 ? t("item") : t("itens")}` : null,
  ];
  return partes.filter((p): p is string => p !== null).join(" · ");
}
