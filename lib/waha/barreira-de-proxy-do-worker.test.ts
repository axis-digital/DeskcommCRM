import { afterEach, describe, expect, it, vi } from "vitest";

import { criarBarreiraDoWatchdog } from "./barreira-de-proxy-do-worker";
import { ErroDeProxy } from "./proxy-antes-do-inicio";

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const pool = {
  WAHA_PROXY_POOL_URL: "http://n8n.interno/provisionar",
  WAHA_PROXY_POOL_TOKEN: "token-sintetico",
  WAHA_PROXY_POOL_INSTANCE: "principal",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("criarBarreiraDoWatchdog", () => {
  it("sem variáveis do pool não há barreira (self-host comum)", () => {
    expect(criarBarreiraDoWatchdog({}, "http://waha", "k", log as never)).toBeUndefined();
  });

  it("configuração inválida vira barreira que SEMPRE bloqueia, nunca 'sem proxy'", async () => {
    const barreira = criarBarreiraDoWatchdog(
      { ...pool, WAHA_SESSION_PROXY: "http://h:1" },
      "http://waha",
      "k",
      log as never,
    );
    expect(barreira).toBeTypeOf("function");
    const erro = await barreira!("s").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeProxy);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("token-sintetico");
  });

  it("com pool completo confirma pelo provisionador e relê a sessão no WAHA", async () => {
    const fetch = vi.fn(async (url: string, opcoes?: RequestInit) => {
      if (String(url).startsWith("http://n8n.interno")) {
        const { instance, session_name, operation_id } = JSON.parse(String(opcoes!.body));
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
      }
      expect(String(url)).toBe("http://waha/api/sessions/sessao-a");
      expect((opcoes!.headers as Record<string, string>)["X-Api-Key"]).toBe("k");
      return new Response(
        JSON.stringify({
          name: "sessao-a",
          status: "STOPPED",
          config: { proxy: { server: "proxy:8080" } },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const barreira = criarBarreiraDoWatchdog(pool, "http://waha", "k", log as never)!;
    await expect(barreira("sessao-a")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sessão ausente no WAHA (404) não confirma", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opcoes?: RequestInit) => {
        if (String(url).startsWith("http://n8n.interno")) {
          const { instance, session_name, operation_id } = JSON.parse(String(opcoes!.body));
          return new Response(
            JSON.stringify({
              resultado: "confirmado",
              instance,
              sessao: session_name,
              operation_id,
              server: "p:1",
              reutilizado: false,
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
    const barreira = criarBarreiraDoWatchdog(pool, "http://waha", "k", log as never)!;
    await expect(barreira("sessao-b")).rejects.toBeInstanceOf(ErroDeProxy);
  });
});
