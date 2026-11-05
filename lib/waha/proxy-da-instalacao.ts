import { criarProvisionadorDeProxy } from "./provisionador-de-proxy";
import { confirmarProxyAntesDoInicio } from "./proxy-antes-do-inicio";

/** Variáveis do modo de pool gerenciado (opt-in). Todas vazias = contrato legado. */
export interface EnvDoPoolDeProxy {
  WAHA_PROXY_POOL_URL?: string;
  WAHA_PROXY_POOL_TOKEN?: string;
  WAHA_PROXY_POOL_INSTANCE?: string;
  /** Proxy fixo legado; não pode coexistir com o pool. */
  WAHA_SESSION_PROXY?: string;
}

type LeitorDaSessao = Parameters<typeof confirmarProxyAntesDoInicio>[2];

/**
 * Decide, pela configuração da instalação, se há barreira de proxy antes do início.
 *
 * - Nenhuma variável do pool: devolve `undefined` e o fluxo segue como sempre
 *   (self-host comum não depende de n8n nem de pool).
 * - Pool completo: devolve a barreira (provisionador + releitura da sessão).
 * - Pool parcial, ou pool junto de `WAHA_SESSION_PROXY`: lança. Falha fechado em vez
 *   de ligar pela metade ou combinar dois modos em silêncio. Os erros não carregam
 *   valores de variável (o token nunca entra na mensagem).
 */
export function proxyAntesDoInicioDaInstalacao(
  env: EnvDoPoolDeProxy,
  transporte: LeitorDaSessao,
): ((nome: string) => Promise<void>) | undefined {
  const url = env.WAHA_PROXY_POOL_URL?.trim() ?? "";
  const token = env.WAHA_PROXY_POOL_TOKEN?.trim() ?? "";
  const instancia = env.WAHA_PROXY_POOL_INSTANCE?.trim() ?? "";
  const definidas = [url, token, instancia].filter(Boolean).length;
  if (definidas === 0) return undefined;
  if (definidas < 3) throw new Error("proxy_pool_configuracao_incompleta");
  if (env.WAHA_SESSION_PROXY?.trim()) throw new Error("proxy_pool_e_proxy_fixo_juntos");

  const provisionar = criarProvisionadorDeProxy({ url, token, instancia });
  return (nome) => confirmarProxyAntesDoInicio(nome, provisionar, transporte);
}
