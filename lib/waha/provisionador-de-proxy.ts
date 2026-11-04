import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ErroDeProxy, type CodigoDeProxy, type ProvisionarProxy } from "./proxy-antes-do-inicio";

// Contrato v1: docs/superpowers/specs/2026-11-03-contrato-provisionador-proxy-waha.md
const FALHA = "proxy_provisionamento_falhou";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOME_MAXIMO = 54;
const INSTANCIA_MAXIMA = 64;

const identidade = { instance: z.string(), sessao: z.string(), operation_id: z.string() };
const respostaSchema = z.discriminatedUnion("resultado", [
  z.strictObject({
    resultado: z.literal("confirmado"),
    ...identidade,
    server: z.string(),
    reutilizado: z.boolean(),
  }),
  z.strictObject({ resultado: z.literal("pool_esgotado"), ...identidade }),
  z.strictObject({ resultado: z.literal("incerto"), ...identidade }),
  z.strictObject({ resultado: z.literal("indisponivel"), ...identidade }),
  z.strictObject({
    resultado: z.literal("conflito"),
    ...identidade,
    codigo: z.enum(["proxy_de_outra_sessao", "divergente_do_pool", "sessao_nao_parada"]),
  }),
]);

function falha(codigo: CodigoDeProxy): ErroDeProxy {
  return new ErroDeProxy(FALHA, codigo);
}

function enderecoDoProxyValido(server: string): boolean {
  try {
    if (!/:[0-9]+$/.test(server) || server.includes("/")) return false;
    const u = new URL(`http://${server}`);
    return Boolean(u.hostname) && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}

const textoSimples = (valor: string, maximo: number) =>
  valor.length > 0 &&
  valor.length <= maximo &&
  valor === valor.trim() &&
  !/[\u0000-\u001f\u007f]/.test(valor);

/**
 * Cliente do contrato v1; ainda não é configurado por nenhuma rota.
 * Desfecho que não seja `confirmado` vira `ErroDeProxy` com código seguro.
 * Erro de rede ou timeout depois do envio é `incerto`: a chamada pode ter chegado.
 */
export function criarProvisionadorDeProxy(config: {
  url: string;
  token: string;
  instancia: string;
  timeoutMs?: number;
}): ProvisionarProxy {
  let url: URL;
  try {
    url = new URL(config.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !config.token.trim() ||
      /[\r\n]/.test(config.token) ||
      !textoSimples(config.instancia, INSTANCIA_MAXIMA) ||
      (config.timeoutMs !== undefined &&
        (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1))
    )
      throw new Error();
  } catch {
    throw new Error("proxy_configuracao_invalida");
  }

  return async (nome, operacao = randomUUID()) => {
    if (!textoSimples(nome, NOME_MAXIMO) || !UUID.test(operacao)) throw falha("indisponivel");

    let resposta: Response;
    try {
      resposta = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({
          instance: config.instancia,
          session_name: nome,
          operation_id: operacao,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
      });
    } catch {
      throw falha("incerto");
    }
    if (!resposta.ok) throw falha("indisponivel");

    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch {
      throw falha("incerto");
    }
    const lido = respostaSchema.safeParse(corpo);
    if (
      !lido.success ||
      lido.data.instance !== config.instancia ||
      lido.data.sessao !== nome ||
      lido.data.operation_id !== operacao
    ) {
      throw falha("incerto");
    }
    if (lido.data.resultado !== "confirmado") throw falha(lido.data.resultado);
    if (!enderecoDoProxyValido(lido.data.server)) throw falha("incerto");
    return { sessao: lido.data.sessao, server: lido.data.server, confirmado: true };
  };
}
