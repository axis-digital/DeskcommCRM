import { afterEach, describe, expect, it, vi } from "vitest";
import { criarProvisionadorDeProxy } from "./provisionador-de-proxy";

afterEach(() => vi.unstubAllGlobals());

describe("cliente do provisionador de proxy", () => {
  const criar = () => criarProvisionadorDeProxy({ url: "http://n8n.internal/provisionar", token: "token-de-teste", timeoutMs: 500 });

  it("envia nome em JSON, token no header e valida recibo sem credenciais", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ sessao: "s1", server: "proxy:8080", confirmado: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(criar()("s1")).resolves.toEqual({ sessao: "s1", server: "proxy:8080", confirmado: true });
    const [url, opcoes] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://n8n.internal/provisionar");
    expect(opcoes.method).toBe("POST");
    expect(opcoes.redirect).toBe("error");
    expect(opcoes.headers).toMatchObject({ Authorization: "Bearer token-de-teste" });
    expect(JSON.parse(String(opcoes.body))).toEqual({ session_name: "s1" });
    expect(opcoes.signal).toBeDefined();
  });

  it.each([
    { sessao: "outra", server: "proxy:8080", confirmado: true },
    { sessao: "s1", server: "proxy:8080", confirmado: false },
    { sessao: "s1", server: "", confirmado: true },
    { sessao: "s1", server: "usuario:senha@proxy:8080", confirmado: true },
    { sessao: "s1", server: "proxy:8080", confirmado: true, password: "nao-deve-sair" },
  ])("recusa recibo inconsistente ou com dados extras", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    await expect(criar()("s1")).rejects.toThrow(/^proxy_provisionamento_falhou$/);
  });

  it("não expõe corpo de erro HTTP ou erro de rede", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("senha-privada", { status: 500 })));
    await expect(criar()("s1")).rejects.toThrow(/^proxy_provisionamento_falhou$/);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("senha-privada"); }));
    await expect(criar()("s1")).rejects.toThrow(/^proxy_provisionamento_falhou$/);
  });

  it("interrompe uma chamada que não responde após o timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, opcoes: RequestInit) => new Promise((_resolve, reject) => {
      opcoes.signal!.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    })));
    const provisionar = criarProvisionadorDeProxy({ url: "http://n8n.internal/provisionar", token: "teste", timeoutMs: 10 });
    await expect(provisionar("s1")).rejects.toThrow(/^proxy_provisionamento_falhou$/);
  });

  it.each(["https://usuario:senha@host/provisionar", "https://host/provisionar?token=segredo", "file:///tmp/arquivo"]) (
    "recusa URL insegura ou com segredos: %s", (url) => {
      expect(() => criarProvisionadorDeProxy({ url, token: "token-de-teste" })).toThrow(/^proxy_configuracao_invalida$/);
    },
  );

  it("recusa token ausente e nomes inválidos antes de enviar", async () => {
    expect(() => criarProvisionadorDeProxy({ url: "http://n8n.internal/provisionar", token: "" })).toThrow(/^proxy_configuracao_invalida$/);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(criar()(" ")).rejects.toThrow(/^proxy_provisionamento_falhou$/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
