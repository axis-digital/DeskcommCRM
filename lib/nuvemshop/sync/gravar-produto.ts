/**
 * Um produto bruto da API → `nuvemshop_products`. Dado ruim devolve `ok:false`
 * (a página segue: um produto ruim não trava a loja); falha de banco LANÇA (o
 * evento volta para a fila e a página é regravada — o upsert é idempotente).
 *
 * "Mais novo vence": o webhook e a varredura do catálogo buscam o mesmo produto
 * na API e podem gravar em paralelo. Quem chega com `updated_at` mais antigo que
 * o guardado não sobrescreve.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ErroDeTraducao } from "./traduzir-pedido";
import { traduzirProduto } from "./traduzir-produto";

export type ResultadoDaGravacaoDeProduto = { ok: true; ignorado?: "ja_mais_novo" } | { ok: false; motivo: string };

function idDe(bruto: unknown): string {
  const id = (bruto as { id?: unknown } | null)?.id;
  return id === undefined || id === null ? "sem_id" : String(id);
}

export async function gravarProduto(
  admin: SupabaseClient,
  ctx: { orgId: string },
  bruto: unknown,
): Promise<ResultadoDaGravacaoDeProduto> {
  let linha;
  try {
    linha = traduzirProduto(bruto);
  } catch (err) {
    if (err instanceof ErroDeTraducao) return { ok: false, motivo: `${err.message}:${idDe(bruto)}` };
    throw err;
  }

  const { data: existente, error: erroLeitura } = await admin
    .from("nuvemshop_products")
    .select("last_updated_at")
    .eq("organization_id", ctx.orgId)
    .eq("external_id", linha.external_id)
    .maybeSingle();
  if (erroLeitura) throw new Error(`nuvemshop_products_leitura:${erroLeitura.message}`);
  const guardado = (existente as { last_updated_at?: string } | null)?.last_updated_at;
  if (guardado && Date.parse(guardado) > Date.parse(linha.last_updated_at)) return { ok: true, ignorado: "ja_mais_novo" };

  const { error } = await admin
    .from("nuvemshop_products")
    .upsert({ ...linha, organization_id: ctx.orgId }, { onConflict: "organization_id,external_id" });
  if (error) throw new Error(`nuvemshop_products_upsert:${error.message}`);
  return { ok: true };
}

/** Produto apagado na loja. Filtra a organização: o admin client ignora RLS. */
export async function apagarProduto(admin: SupabaseClient, ctx: { orgId: string }, externalId: string): Promise<void> {
  const { error } = await admin
    .from("nuvemshop_products")
    .delete()
    .eq("organization_id", ctx.orgId)
    .eq("external_id", externalId);
  if (error) throw new Error(`nuvemshop_products_delete:${error.message}`);
}
