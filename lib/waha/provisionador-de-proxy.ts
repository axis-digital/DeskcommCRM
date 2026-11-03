import { z } from "zod";
import type { ProvisionarProxy } from "./proxy-antes-do-inicio";

const reciboSchema = z.strictObject({ sessao: z.string(), server: z.string(), confirmado: z.literal(true) });

function enderecoDoProxyValido(server: string): boolean {
  try {
    if (!/:[0-9]+$/.test(server) || server.includes("/")) return false;
    const u = new URL(`http://${server}`);
    return Boolean(u.hostname) && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}

/** Cliente do contrato proposto; ainda não é configurado por nenhuma rota. */
export function criarProvisionadorDeProxy(config: { url: string; token: string; timeoutMs?: number }): ProvisionarProxy {
  let url: URL;
  try {
    url = new URL(config.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      !config.token.trim() || /[\r\n]/.test(config.token) ||
      (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1))) throw new Error();
  } catch {
    throw new Error("proxy_configuracao_invalida");
  }

  return async (nome) => {
    try {
      if (!nome.trim() || nome !== nome.trim() || nome.length > 54) throw new Error();
      const resposta = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ session_name: nome }),
        redirect: "error",
        signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
      });
      if (!resposta.ok) throw new Error();
      const parsed = reciboSchema.safeParse(await resposta.json());
      if (!parsed.success || parsed.data.sessao !== nome || !enderecoDoProxyValido(parsed.data.server)) throw new Error();
      return parsed.data;
    } catch {
      throw new Error("proxy_provisionamento_falhou");
    }
  };
}
