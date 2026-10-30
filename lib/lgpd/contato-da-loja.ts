/**
 * Achar o contato da loja pelo id do cliente na Nuvemshop, para o apagamento e a cópia dos
 * dados do titular (webhooks `customer-redact` e `customer-data-request`, e o export).
 *
 * ─── O que estava errado ──────────────────────────────────────────────────────
 * A busca procurava `source_metadata->>nuvemshop_customer_id`, uma chave que nenhum código
 * grava. O sync da loja grava `{ store_id, customer_id }`. Então a busca principal nunca achava
 * contato criado pelo sync, e só o plano B (e-mail do webhook) funcionava: contato sem e-mail,
 * ou com outro, ficava fora do alcance do direito do titular.
 *
 * ─── Como acha agora ─────────────────────────────────────────────────────────
 * 1. A chave do sync: `customer_id` COM `store_id`. A presença de `store_id` é o que diz que foi
 *    o sync da Nuvemshop quem gravou aquele `customer_id` (nenhum outro código grava essa chave).
 *    NÃO filtra por `source`: o `source` do contato pode ter sido reescrito por um carimbo de
 *    origem (site, anúncio), e o direito do titular não pode depender de um rótulo mutável.
 * 2. A chave legada, `nuvemshop_customer_id` com `source = 'nuvemshop'`, como era.
 *
 * ─── Os dois custos de errar ─────────────────────────────────────────────────
 * Não achar deixa o titular sem resposta. Achar a pessoa ERRADA anonimiza quem não pediu. Por
 * isso `maybeSingle()`: se a mesma chave casar com mais de um contato (duas lojas na mesma
 * organização com o mesmo id), a busca NÃO escolhe ninguém — o erro vai anotado e o chamador cai
 * no plano B, em vez de anonimizar um palpite.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultadoDaBuscaDoContato {
  contato: { id: string } | null;
  /** Falhas de leitura de cada tentativa, para o chamador registrar. Vazio quando nada deu errado. */
  erros: string[];
}

export async function acharContatoDaLoja(
  admin: SupabaseClient,
  organizationId: string,
  externalCustomerId: string,
): Promise<ResultadoDaBuscaDoContato> {
  const idDoCliente = externalCustomerId.trim();
  const erros: string[] = [];
  if (!idDoCliente) return { contato: null, erros };

  const porSync = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId) // filtro de tenant programático: o admin ignora a RLS
    .eq("source_metadata->>customer_id", idDoCliente)
    .not("source_metadata->>store_id", "is", null)
    .maybeSingle();
  if (porSync.error) erros.push(`sync: ${porSync.error.message}`);
  if (porSync.data) return { contato: { id: porSync.data.id as string }, erros };

  const legada = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("source", "nuvemshop")
    .eq("source_metadata->>nuvemshop_customer_id", idDoCliente)
    .maybeSingle();
  if (legada.error) erros.push(`legada: ${legada.error.message}`);
  if (legada.data) return { contato: { id: legada.data.id as string }, erros };

  return { contato: null, erros };
}
