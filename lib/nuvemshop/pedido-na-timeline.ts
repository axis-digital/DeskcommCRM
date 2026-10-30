import { MOEDA_PADRAO, formatCents } from "@/lib/money";
import type { TimelineItemDoContato } from "@/lib/types/contacts";

/**
 * O pedido da loja na linha do tempo do contato — uma PROJEÇÃO, não uma cópia.
 *
 * `crm_lead_activities.lead_id` é NOT NULL: quem só comprou, e nunca teve
 * negócio, não tem onde gravar atividade. Gravar uma segunda cópia do pedido
 * ainda criaria duas fontes de verdade (anti-pattern 2 da doutrina) e deixaria
 * de fora os pedidos que já foram sincronizados. Então a rota lê `orders` e
 * entrega o pedido no MESMO formato da atividade: o dado vive num lugar só, vale
 * para todo pedido já sincronizado e acompanha a situação atual dele.
 *
 * Este arquivo é puro de propósito (sem Supabase, sem React): é o que a rota
 * usa para montar o item e o que a tela usa para escrever a linha.
 */

/** O `type` do item. Fora de `ActivityType` de propósito: não é linha do banco. */
export const TIPO_PEDIDO_NA_TIMELINE = "order_placed";

/** O rótulo da linha. É chave de tradução (dicionário), então não muda ao léu. */
export const ROTULO_DO_PEDIDO = "Pedido realizado";

/**
 * As colunas lidas. O `payload` NÃO entra inteiro: a linha só precisa do número
 * da loja, e o atalho `numero:payload->>number` é o mesmo do painel da Inbox
 * (`crm-summary`).
 */
export const PEDIDO_COLS =
  "id, organization_id, contact_id, external_provider, external_id, status, total_cents, currency, ordered_at, numero:payload->>number";

/** O que a rota lê de `orders` (o retorno de `PEDIDO_COLS`). */
export interface PedidoParaTimeline {
  id: string;
  organization_id: string;
  contact_id: string | null;
  external_provider: string | null;
  external_id: string | null;
  status: string | null;
  total_cents: number | null;
  currency: string | null;
  ordered_at: string;
  numero: string | null;
}

/**
 * A situação como a pessoa fala. Os valores são os de `orders.status`; um
 * valor que não está aqui aparece como veio (`corpoDoPedido`), nunca some.
 */
const SITUACAO_DO_PEDIDO: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  packed: "Embalado",
  shipped: "Despachado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/** Fonte quando o pedido não diz de qual loja veio — nunca string vazia. */
const FONTE_SEM_NOME = "loja";

export function pedidoParaItemDaTimeline(p: PedidoParaTimeline): TimelineItemDoContato {
  return {
    id: p.id,
    organization_id: p.organization_id,
    // O pedido não pertence a negócio nenhum; é por isso que a rota o lê à parte.
    lead_id: null,
    contact_id: p.contact_id,
    source_module: p.external_provider || FONTE_SEM_NOME,
    source_id: p.id,
    type: TIPO_PEDIDO_NA_TIMELINE,
    // Só o que a linha mostra. Nada que identifique o comprador entra aqui.
    payload: {
      numero: p.numero,
      external_id: p.external_id,
      status: p.status,
      total_cents: p.total_cents,
      currency: p.currency,
    },
    metadata: {},
    performed_at: p.ordered_at,
    performed_by_user_id: null,
    // Quem fez o pedido foi o cliente. Nomear a pessoa não é preciso: o contato
    // é o dono desta página.
    actor_kind: "contact",
    actor_agent_id: null,
    reason: null,
    evidence: null,
    actor_agent_name: null,
    actor_user_name: null,
  };
}

export function ehPedidoDaTimeline(item: { type: string }): boolean {
  return item.type === TIPO_PEDIDO_NA_TIMELINE;
}

/** "#380 · Despachado · R$ 379,90". Parte ausente é omitida, nunca inventada. */
export function corpoDoPedido(
  payload: Record<string, unknown>,
  t: (texto: string) => string = (texto) => texto,
): string {
  const codigo = texto(payload.numero) ?? texto(payload.external_id);
  const status = texto(payload.status);
  const total = typeof payload.total_cents === "number" ? payload.total_cents : null;
  const moeda = texto(payload.currency) ?? MOEDA_PADRAO;

  const partes = [
    codigo ? `#${codigo}` : null,
    status ? t(SITUACAO_DO_PEDIDO[status] ?? status) : null,
    total !== null ? formatCents(total, moeda) : null,
  ];
  return partes.filter((parte): parte is string => parte !== null).join(" · ");
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}
