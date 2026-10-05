/**
 * Host do Measurement Protocol. Vazio = o host real do Google. A variável só
 * existe para apontar a instalação para um receptor de prova (doutrina de QA
 * com recurso real) — mesma régua de `META_ADS_GRAPH_BASE_URL`, e mesma
 * validação (`hostAceito`): http só para host interno fora de produção.
 */
import { logger } from "@/lib/logger";
import { hostAceito } from "../meta/graph-base";

export const HOST_PADRAO_DO_GA4 = "https://www.google-analytics.com";
const CHAVE = "GA4_MP_BASE_URL";

export function hostDoGa4(): string {
  const daVariavel = process.env[CHAVE]?.trim();
  if (!daVariavel) return HOST_PADRAO_DO_GA4;
  const aceito = hostAceito(daVariavel);
  if (aceito) return aceito;
  logger.warn(`[ga4] ${CHAVE} recusado: use uma base absoluta http(s). Falando com o host real.`);
  return HOST_PADRAO_DO_GA4;
}
