import { chavesDe, type ChavesDoContato } from "./sync/contato-do-pedido";

/**
 * O que a pessoa faz na loja, traduzido para `site_events` (migration 9902).
 *
 * Puro de propósito (sem banco, sem rede): é o que o handler do webhook e o cron
 * do carrinho abandonado usam para montar o fato, e o que os testes medem.
 *
 * Regra de ouro do payload: SÓ o que a linha do tempo precisa para se explicar.
 * Nome, e-mail, telefone, CPF e endereço vivem no contato (que é quem a RLS, a
 * anonimização e a exportação LGPD já protegem). O token e a URL do checkout
 * ficam de fora de propósito: quem tem a URL entra no carrinho da pessoa.
 */

export const FONTE_DA_LOJA = "nuvemshop";

export type TipoDeEventoDoSite = "cadastro" | "carrinho_abandonado";

export interface EventoDoSite {
  kind: TipoDeEventoDoSite;
  source: string;
  dedupe_key: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export interface EventoComChaves {
  evento: EventoDoSite;
  chaves: ChavesDoContato;
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function idDe(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
}

function textoDe(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * "291.35" → 29135. Valor ausente ou ilegível é `null`, nunca zero: zero é um
 * valor (carrinho grátis) e `null` é "não sei", e a tela omite o segundo.
 */
export function paraCentavos(valor: string | number | null | undefined): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

/**
 * A Nuvemshop datam como `2026-10-06T14:33:12+0000` (sem os dois-pontos do
 * deslocamento). Data ilegível cai no instante do processamento, em vez de gravar
 * um evento que ninguém consegue ordenar.
 */
function paraIso(valor: unknown, agora: Date): string {
  const bruto = textoDe(valor);
  if (bruto) {
    const t = Date.parse(bruto.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return agora.toISOString();
}

/** Cadastro na loja: o cliente criou a conta (webhook `customer/created`). */
export function eventoDeCadastro(bruto: unknown, agora: Date = new Date()): EventoComChaves | null {
  const c = objeto(bruto);
  const id = c ? idDe(c.id) : null;
  if (!c || !id) return null;
  return {
    evento: {
      kind: "cadastro",
      source: FONTE_DA_LOJA,
      dedupe_key: `cadastro:${id}`,
      occurred_at: paraIso(c.created_at, agora),
      payload: { customer_id: id },
    },
    chaves: chavesDe({
      telefone: textoDe(c.phone),
      email: textoDe(c.email),
      cpf: textoDe(c.identification),
      nome: textoDe(c.name),
    }),
  };
}

/**
 * Carrinho abandonado: a pessoa chegou ao segundo passo do checkout e não
 * finalizou. Carrinho que já virou pedido (`completed_at`) não é abandono.
 */
export function eventoDeCarrinhoAbandonado(
  bruto: unknown,
  agora: Date = new Date(),
): EventoComChaves | null {
  const c = objeto(bruto);
  const id = c ? idDe(c.id) : null;
  if (!c || !id) return null;
  if (textoDe(c.completed_at)) return null;

  const produtos = Array.isArray(c.products) ? c.products : [];
  const itens = produtos.reduce<number>((soma, p) => {
    const q = objeto(p)?.quantity;
    return soma + (typeof q === "number" && Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);

  const totalCents = paraCentavos(c.total as string | number | null | undefined);
  const payload: Record<string, unknown> = { checkout_id: id };
  if (totalCents !== null) payload.total_cents = totalCents;
  const moeda = textoDe(c.currency);
  if (moeda) payload.currency = moeda;
  if (itens > 0) payload.itens = itens;

  return {
    evento: {
      kind: "carrinho_abandonado",
      source: FONTE_DA_LOJA,
      dedupe_key: `carrinho_abandonado:${id}`,
      occurred_at: paraIso(c.updated_at ?? c.created_at, agora),
      payload,
    },
    chaves: chavesDe({
      telefone: textoDe(c.contact_phone),
      email: textoDe(c.contact_email),
      cpf: textoDe(c.contact_identification),
      nome: textoDe(c.contact_name),
    }),
  };
}
