import { ChannelConnectionError } from "@/lib/channels/connect-waha";
import { MENSAGEM_DO_PROXY } from "@/lib/channels/motivo-de-proxy";
import {
  CODIGOS_DE_PROXY,
  STATUS_HTTP_DO_PROXY,
  type CodigoDeProxy,
} from "./proxy-antes-do-inicio";
import { proxyAntesDoInicioDaInstalacao, type EnvDoPoolDeProxy } from "./proxy-da-instalacao";

type LeitorDaSessao = Parameters<typeof proxyAntesDoInicioDaInstalacao>[1];

export interface FalhaDeRota {
  code: string;
  message: string;
  status: number;
}

/**
 * Resolve a barreira de proxy para uma rota que inicia sessão. Configuração
 * inválida do pool vira 503 com código estável: no modo gerenciado, errar a
 * configuração nunca pode degradar para "iniciar sem proxy".
 */
export function barreiraDeProxyDaRota(
  transporte: LeitorDaSessao,
  env: EnvDoPoolDeProxy = process.env as EnvDoPoolDeProxy,
):
  | { ok: true; barreira: ((nome: string) => Promise<void>) | undefined }
  | { ok: false; falha: FalhaDeRota } {
  try {
    return { ok: true, barreira: proxyAntesDoInicioDaInstalacao(env, transporte) };
  } catch {
    return {
      ok: false,
      falha: {
        code: "proxy_pool_misconfigured",
        message:
          "O proxy individual desta instalação está mal configurado. Fale com quem administra a instalação antes de conectar um número.",
        status: 503,
      },
    };
  }
}

/** Falha de rota para um código seguro de proxy. */
export function falhaDoCodigoDeProxy(codigo: CodigoDeProxy): FalhaDeRota {
  return {
    code: `connection_proxy_${codigo}`,
    message: MENSAGEM_DO_PROXY[codigo],
    status: STATUS_HTTP_DO_PROXY[codigo],
  };
}

/** Falha de barreira de proxy vinda do conector; `null` para qualquer outro erro. */
export function falhaDeProxyDaConexao(error: unknown): FalhaDeRota | null {
  if (!(error instanceof ChannelConnectionError)) return null;
  const codigo = CODIGOS_DE_PROXY.find((c) => error.code === `connection_proxy_${c}`);
  return codigo ? falhaDoCodigoDeProxy(codigo) : null;
}
