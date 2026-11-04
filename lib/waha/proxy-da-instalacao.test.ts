import { describe, expect, it, vi } from "vitest";
import { proxyAntesDoInicioDaInstalacao } from "./proxy-da-instalacao";
import { ErroDeProxy } from "./proxy-antes-do-inicio";

const pool = {
  WAHA_PROXY_POOL_URL: "http://n8n.interno/webhook/provisionar",
  WAHA_PROXY_POOL_TOKEN: "token-sintetico",
  WAHA_PROXY_POOL_INSTANCE: "principal",
};
const leitor = { getVerifiedSession: vi.fn() };

describe("proxyAntesDoInicioDaInstalacao", () => {
  it("sem nenhuma variável do pool mantém o contrato legado (sem barreira)", () => {
    expect(proxyAntesDoInicioDaInstalacao({}, leitor)).toBeUndefined();
  });

  it("proxy fixo legado sozinho continua sem barreira", () => {
    expect(
      proxyAntesDoInicioDaInstalacao({ WAHA_SESSION_PROXY: "http://u:s@h:1" }, leitor),
    ).toBeUndefined();
  });

  it("configuração parcial do pool é recusada em vez de ligar pela metade", () => {
    expect(() =>
      proxyAntesDoInicioDaInstalacao({ WAHA_PROXY_POOL_URL: pool.WAHA_PROXY_POOL_URL }, leitor),
    ).toThrow("proxy_pool_configuracao_incompleta");
  });

  it("pool e proxy fixo juntos são recusados, nunca combinados em silêncio", () => {
    expect(() =>
      proxyAntesDoInicioDaInstalacao({ ...pool, WAHA_SESSION_PROXY: "http://h:1" }, leitor),
    ).toThrow("proxy_pool_e_proxy_fixo_juntos");
  });

  it("URL inválida do pool falha fechado", () => {
    expect(() =>
      proxyAntesDoInicioDaInstalacao({ ...pool, WAHA_PROXY_POOL_URL: "nao-e-url" }, leitor),
    ).toThrow("proxy_configuracao_invalida");
  });

  it("com o pool completo devolve a barreira, que confirma pelo provisionador e pela releitura", async () => {
    const fetch = vi.fn(async (_url: string, opcoes: RequestInit) => {
      const { instance, session_name, operation_id } = JSON.parse(String(opcoes.body));
      return new Response(
        JSON.stringify({
          resultado: "confirmado",
          instance,
          sessao: session_name,
          operation_id,
          server: "proxy:8080",
          reutilizado: false,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    try {
      const lê = {
        getVerifiedSession: vi.fn(async (name: string) => ({
          name,
          status: "STOPPED",
          config: { proxy: { server: "proxy:8080" } },
        })),
      };
      const barreira = proxyAntesDoInicioDaInstalacao(pool, lê);
      expect(barreira).toBeTypeOf("function");
      await barreira!("sessao-a");
      expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).instance).toBe("principal");
      expect(lê.getVerifiedSession).toHaveBeenCalledWith("sessao-a");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("desfecho que não é confirmado vira ErroDeProxy com código seguro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opcoes: RequestInit) => {
        const { instance, session_name, operation_id } = JSON.parse(String(opcoes.body));
        return new Response(
          JSON.stringify({
            resultado: "pool_esgotado",
            instance,
            sessao: session_name,
            operation_id,
          }),
          { status: 200 },
        );
      }),
    );
    try {
      const barreira = proxyAntesDoInicioDaInstalacao(pool, leitor)!;
      const erro = await barreira("sessao-b").catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroDeProxy);
      expect((erro as ErroDeProxy).codigo).toBe("pool_esgotado");
      expect(String((erro as Error).message)).not.toContain("token-sintetico");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
