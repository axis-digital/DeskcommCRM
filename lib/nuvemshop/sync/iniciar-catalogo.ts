/**
 * Começa uma varredura do catálogo: chamado pelo callback OAuth (`conexao`),
 * pela reconciliação de 30 min e pelo botão "Sincronizar agora", ao lado do
 * início do sync de pedidos.
 *
 * Conexão e botão trazem a loja inteira. A reconciliação continua do produto
 * mais novo já espelhado (o próprio espelho é o cursor), e é a rede de segurança
 * do webhook. O que ela NÃO alcança: produto apagado na loja cujo webhook
 * `product/deleted` se perdeu — ele só some do espelho no próximo evento do
 * produto, ou nunca. O catálogo que o agente consulta é o do RAG, que lê a loja.
 */
import type { OrigemDoRun } from "./constantes";
import type { DepsDoCatalogo } from "./catalogo-deps";

export type ResultadoDoInicioDoCatalogo =
  | { ok: true }
  | { ok: false; motivo: "nao_conectada" | "desautorizada" | "sync_em_andamento" | "falha_ao_iniciar" };

const FOLGA_DO_CURSOR_MS = 60_000;

export async function iniciarCatalogo(
  deps: DepsDoCatalogo,
  orgId: string,
  origem: OrigemDoRun,
): Promise<ResultadoDoInicioDoCatalogo> {
  const integ = await deps.carregarIntegracao(orgId);
  if (!integ || integ.status === "disconnected") return { ok: false, motivo: "nao_conectada" };
  if (integ.status !== "healthy" && origem !== "conexao") return { ok: false, motivo: "desautorizada" };
  if (await deps.catalogoEmAndamento(orgId)) return { ok: false, motivo: "sync_em_andamento" };

  let desde: string | null = null;
  if (origem === "reconciliacao") {
    const cursor = await deps.cursorDoCatalogo(orgId);
    if (cursor) desde = new Date(Date.parse(cursor) - FOLGA_DO_CURSOR_MS).toISOString();
  }

  try {
    await deps.emitirPagina(orgId, integ.id, { pagina: 1, desde, gravados: 0, comErro: 0 });
  } catch {
    return { ok: false, motivo: "falha_ao_iniciar" };
  }
  return { ok: true };
}
