/**
 * `nuvemshop-produto.v1` — webhook `product/*` → `GET /products/{id}` →
 * `nuvemshop_products`. O webhook só traz o id; o produto inteiro vem da API,
 * como no pedido (`pedido.handler.ts`). `product/deleted` apaga do espelho sem
 * ir à API, e um 404 no `created/updated` (apagado antes de o evento ser
 * tratado) faz o mesmo.
 *
 * DOIS nomes de evento, porque a rota do webhook mudou no meio do caminho:
 *  - `nuvemshop.product_synced` é o de hoje (#3243): o indexador do RAG o
 *    escuta, e o webhook o emite com `product_id` e `acao` (created, updated,
 *    deleted). Os dois consumidores convivem: cada um tem a sua chave em
 *    `consumed_by`. A carga inicial da conexão usa o mesmo nome com
 *    `catalogo_inteiro`, que não é um produto: quem a atende é a varredura.
 *  - `nuvemshop.product_created|updated|deleted` são os de ANTES: ficaram
 *    `pending` para sempre porque nenhum consumidor os lia (anti-pattern 3).
 *    Este handler os drena, e o espelho recupera o catálogo que eles traziam.
 */
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { NuvemshopApiError } from "@/lib/nuvemshop/api-client";
import { depsDoCatalogoReais, type DepsDoCatalogo } from "./catalogo-deps";
import { tratarErroDaApi } from "./erro-da-api";

const KEY = "nuvemshop-produto.v1";
const r = (status: HandlerResult["status"], detail: string): HandlerResult => ({ consumer_key: KEY, status, detail });

export async function processarProdutoDoWebhook(row: EventRow, deps: DepsDoCatalogo): Promise<HandlerResult> {
  if (row.payload.catalogo_inteiro === true) return r("skipped", "catalogo_inteiro");
  const id = row.payload.product_id ?? row.payload.id;
  if (id === undefined || id === null || String(id) === "") return r("skipped", "sem_id");
  const externalId = String(id);
  const orgId = row.organization_id;

  const integ = await deps.carregarIntegracao(orgId);
  if (!integ || integ.status !== "healthy") return r("skipped", "integracao_inativa");

  if (row.event_type === "nuvemshop.product_deleted" || row.payload.acao === "deleted") {
    await deps.apagarProduto(orgId, externalId);
    return r("ok", "apagado");
  }

  let bruto: unknown;
  try {
    bruto = await deps.api(integ).getProduct(externalId);
  } catch (err) {
    if (err instanceof NuvemshopApiError && err.status === 404) {
      await deps.apagarProduto(orgId, externalId);
      return r("ok", "produto_inexistente");
    }
    return tratarErroDaApi(err, integ, deps, KEY);
  }

  const g = await deps.gravarProduto(orgId, bruto);
  return g.ok ? r("ok", g.ignorado ?? "gravado") : r("skipped", g.motivo);
}

export const nuvemshopProdutoHandler: EventHandler = {
  key: KEY,
  naOrgParada: "pula",
  events: [
    "nuvemshop.product_synced",
    "nuvemshop.product_created",
    "nuvemshop.product_updated",
    "nuvemshop.product_deleted",
  ],
  handle: (row) => processarProdutoDoWebhook(row, depsDoCatalogoReais()),
};
