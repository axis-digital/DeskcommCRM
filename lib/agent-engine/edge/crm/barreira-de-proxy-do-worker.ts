import { ErroDeProxy, type ProvisionarProxy } from "@/lib/waha/proxy-antes-do-inicio";
import {
  proxyAntesDoInicioDaInstalacao,
  type EnvDoPoolDeProxy,
} from "@/lib/waha/proxy-da-instalacao";

import type { Logger } from "../../obs/logger";

type Sessao = { name: string; status: string; config?: Record<string, unknown> | null };

/**
 * Leitor mínimo da sessão para a barreira. O watchdog fala com o WAHA por `fetch`
 * cru (admin-plane), então não arrasta o `WahaClient` do app. 404 e qualquer
 * resposta ilegível viram `null`: a barreira trata como "não confirmado".
 */
function leitorDeSessao(wahaBaseUrl: string, wahaApiKey: string) {
  return {
    async getVerifiedSession(nome: string): Promise<Sessao | null> {
      const res = await fetch(`${wahaBaseUrl}/api/sessions/${encodeURIComponent(nome)}`, {
        headers: { "X-Api-Key": wahaApiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const corpo = (await res.json().catch(() => null)) as Sessao | null;
      return corpo && typeof corpo.name === "string" && typeof corpo.status === "string"
        ? corpo
        : null;
    },
  };
}

/**
 * Barreira de proxy do reconciliador do worker (modo de pool gerenciado, opt-in).
 *
 * - Sem nenhuma variável do pool: `undefined` — o watchdog religa como sempre.
 * - Pool completo: barreira real (provisionador + releitura da sessão parada).
 * - Configuração inválida (parcial, ou junto de `WAHA_SESSION_PROXY`): uma barreira
 *   que SEMPRE bloqueia, com um erro no log. Quem optou pelo modo gerenciado
 *   errando a configuração fica com a sessão parada e visível, nunca religada sem
 *   proxy; derrubar o boot do worker inteiro por isso seria pior (o watchdog
 *   também reconcilia o espelho e reenvia mensagens presas).
 */
export function criarBarreiraDoWatchdog(
  env: EnvDoPoolDeProxy,
  wahaBaseUrl: string,
  wahaApiKey: string,
  log: Logger,
): ((nome: string) => Promise<void>) | undefined {
  try {
    return proxyAntesDoInicioDaInstalacao(env, leitorDeSessao(wahaBaseUrl, wahaApiKey));
  } catch {
    // Só uma constante: nem o motivo detalhado nem valor de variável entram no log.
    log.error(
      "watchdog: modo de pool de proxy mal configurado — sessões paradas NÃO serão religadas",
      {},
    );
    return async () => {
      throw new ErroDeProxy("proxy_pool_mal_configurado", "indisponivel");
    };
  }
}

export type { ProvisionarProxy };
