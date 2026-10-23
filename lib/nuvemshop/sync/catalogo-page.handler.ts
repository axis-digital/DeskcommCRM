/**
 * `nuvemshop-catalogo.v1` — UMA página do catálogo por evento, como os pedidos
 * (`sync-page.handler.ts`): um handler que percorresse todas as páginas cairia
 * na detecção de evento preso do dreno. Cada página é um evento, com retry,
 * backoff e `retry` sem contar tentativa (429) do dreno.
 *
 * Sem run, trava nem estado próprio: o upsert é "mais novo vence" e idempotente,
 * então duas varreduras em paralelo só custam chamadas. Quem evita a segunda é
 * `iniciarCatalogo`.
 */
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { depsDoCatalogoReais, type DepsDoCatalogo } from "./catalogo-deps";
import {
  EVENTO_CATALOG_PAGE,
  PAGINA_MAXIMA_DE_PRODUTOS,
  PRODUTOS_POR_PAGINA,
  passoDoCatalogoSchema,
} from "./constantes";
import { tratarErroDaApi } from "./erro-da-api";

const KEY = "nuvemshop-catalogo.v1";
const r = (status: HandlerResult["status"], detail: string): HandlerResult => ({ consumer_key: KEY, status, detail });

export async function processarPaginaDoCatalogo(row: EventRow, deps: DepsDoCatalogo): Promise<HandlerResult> {
  const parsed = passoDoCatalogoSchema.safeParse(row.payload);
  if (!parsed.success) return r("skipped", "payload_invalido");
  const passo = parsed.data;
  const orgId = row.organization_id;

  const integ = await deps.carregarIntegracao(orgId);
  if (!integ || integ.status !== "healthy") return r("skipped", "integracao_inativa");

  let itens: unknown[];
  try {
    itens = await deps.api(integ).listProducts({
      page: passo.pagina,
      perPage: PRODUTOS_POR_PAGINA,
      ...(passo.desde ? { updatedAtMin: passo.desde } : {}),
    });
  } catch (err) {
    return tratarErroDaApi(err, integ, deps, KEY);
  }

  let gravados = passo.gravados;
  let comErro = passo.comErro;
  for (const bruto of itens) {
    const g = await deps.gravarProduto(orgId, bruto);
    if (g.ok) gravados++;
    else comErro++;
  }

  const cheia = itens.length === PRODUTOS_POR_PAGINA;
  const noTeto = passo.pagina >= PAGINA_MAXIMA_DE_PRODUTOS;
  if (cheia && !noTeto) {
    await deps.emitirPagina(orgId, integ.id, { pagina: passo.pagina + 1, desde: passo.desde, gravados, comErro });
    return r("ok", `pagina_${passo.pagina}`);
  }

  // Fim da varredura. Rodada que não gravou nem errou em nada não audita.
  if (gravados > 0 || comErro > 0) {
    await deps.auditar({
      action: "nuvemshop.catalog_synced",
      organizationId: orgId,
      resourceType: "tenant_integration",
      resourceId: integ.id,
      metadata: {
        produtos_gravados: gravados,
        produtos_com_erro: comErro,
        paginas: passo.pagina,
        ...(cheia && noTeto ? { truncado: true } : {}),
      },
    });
  }
  return r("ok", cheia && noTeto ? "catalogo_truncado" : "catalogo_concluido");
}

export const nuvemshopCatalogoHandler: EventHandler = {
  key: KEY,
  naOrgParada: "pula",
  events: [EVENTO_CATALOG_PAGE],
  handle: (row) => processarPaginaDoCatalogo(row, depsDoCatalogoReais()),
};
