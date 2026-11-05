import { CODIGOS_DE_PROXY, type CodigoDeProxy } from "@/lib/waha/proxy-antes-do-inicio";

/**
 * O que a pessoa lê quando o proxy individual de uma conexão não foi confirmado.
 *
 * Fonte ÚNICA: a resposta da API (`lib/waha/proxy-na-rota.ts`) e o cartão de
 * Conexões leem daqui — uma frase só, sem versão da tela que diverge da versão
 * do servidor. Este módulo é puro e sem dependência de servidor, então o
 * navegador pode importá-lo.
 *
 * Nenhum texto carrega endereço, porta ou credencial do proxy: o motivo gravado
 * em `status_reason` é só o código seguro (`proxy_<codigo>`).
 */
export const MENSAGEM_DO_PROXY: Record<CodigoDeProxy, string> = {
  pool_esgotado:
    "Não há proxy livre para este número agora. A conexão foi guardada e nada foi iniciado; peça a quem administra a instalação para liberar proxies e tente de novo em Conexões.",
  conflito:
    "O proxy desta conexão precisa de revisão antes de iniciar. Nada foi iniciado nem trocado; avise quem administra a instalação.",
  incerto:
    "Não foi possível confirmar o proxy desta conexão. Nada foi iniciado; tente novamente em instantes em Conexões.",
  indisponivel:
    "O serviço de proxy está indisponível. Nada foi iniciado; tente novamente em instantes em Conexões.",
};

const PREFIXO = "proxy_";

/**
 * Lê o código de proxy gravado em `channel_sessions.status_reason`, ou `null`
 * para qualquer outro motivo. Só o vocabulário fechado conta: um `proxy_` com
 * sufixo desconhecido não vira mensagem inventada.
 */
export function motivoDeProxy(statusReason: string | null | undefined): CodigoDeProxy | null {
  if (!statusReason?.startsWith(PREFIXO)) return null;
  const sufixo = statusReason.slice(PREFIXO.length);
  return CODIGOS_DE_PROXY.find((codigo) => codigo === sufixo) ?? null;
}
