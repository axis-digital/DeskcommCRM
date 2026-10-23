import { z } from "zod";

export const PROVEDOR = "nuvemshop" as const;
/** 50 e não 200: cada pedido custa ~4 consultas, e o evento precisa caber no dreno por cron. */
export const PAGINA_TAMANHO = 50;
/** A Nuvemshop entrega no máximo 10.000 itens por consulta. */
export const PAGINA_MAXIMA = 10_000 / PAGINA_TAMANHO;
export const MESES_DE_BACKFILL = 12;
export const TRAVA_MS = 15 * 60_000;
export const EVENTO_SYNC_PAGE = "nuvemshop.sync_page";

export type OrigemDoRun = "conexao" | "reconciliacao" | "manual";

export const passoDoSyncSchema = z.object({
  run_id: z.uuid(),
  janela_ini: z.iso.datetime(),
  janela_fim: z.iso.datetime(),
  alvo_fim: z.iso.datetime(),
  pagina: z.number().int().min(1),
});
export type PassoDoSync = z.infer<typeof passoDoSyncSchema>;

/** Catálogo: uma página da API por evento, como os pedidos. */
export const EVENTO_CATALOG_PAGE = "nuvemshop.catalog_page";
export const PRODUTOS_POR_PAGINA = 200;
/** 10.000 itens por consulta é o teto da Nuvemshop. */
export const PAGINA_MAXIMA_DE_PRODUTOS = 10_000 / PRODUTOS_POR_PAGINA;

export const passoDoCatalogoSchema = z.object({
  pagina: z.number().int().min(1),
  /** Ausente/null = a loja inteira; presente = só o que mudou desde então. */
  desde: z.iso.datetime().nullable(),
  /** Soma das páginas anteriores, para a auditoria do fim da varredura. */
  gravados: z.number().int().min(0).default(0),
  comErro: z.number().int().min(0).default(0),
});
export type PassoDoCatalogo = z.infer<typeof passoDoCatalogoSchema>;
