import { afterEach, describe, expect, it, vi } from "vitest";
import { criarProvisionadorDeProxy } from "./provisionador-de-proxy";

afterEach(() => vi.unstubAllGlobals());

const OPERACAO = "6f1b6f0e-5c1e-4a53-9a0e-5b1d3d0f6a11";
const responder = (corpo: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
const confirmado = { resultado: "confirmado", instance: "principal", sessao: "s1", operation_id: OPERACAO, server: "proxy:8080", reutilizado: false };

describe("cliente do provisionador de proxy (contrato v1)", () => {
  const criar = () => criarProvisionadorDeProxy({ url: "http://n8n.internal/provisionar", token: "token-de-teste", instancia: "principal", timeoutMs: 500 });
  const codigoDe = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { codigo?: string }) => ({ mensagem: e.message, codigo: e.codigo }));

  it("envia instância, sessão e operação em JSON, com token no header", async () => {
    const fetch = responder(confirmado);
    vi.stubGlobal("fetch", fetch);
    await expect(criar()("s1", OPERACAO)).resolves.toEqual({ sessao: "s1", server: "proxy:8080", confirmado: true });
    const [url, opcoes] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://n8n.internal/provisionar");
    expect(opcoes.method).toBe("POST");
    expect(opcoes.redirect).toBe("error");
    expect(opcoes.headers).toMatchObject({ Authorization: "Bearer token-de-teste" });
    expect(JSON.parse(String(opcoes.body))).toEqual({ instance: "principal", session_name: "s1", operation_id: OPERACAO });
    expect(opcoes.signal).toBeDefined();
  });

  it("gera um operation_id UUID quando o chamador não informa", async () => {
    const fetch = responder({ ...confirmado, operation_id: "x" });
    vi.stubGlobal("fetch", fetch);
    await criar()("s1").catch(() => undefined);
    const corpo = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(corpo.operation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it.each([
    [{ resultado: "pool_esgotado", instance: "principal", sessao: "s1", operation_id: OPERACAO }, "pool_esgotado"],
    [{ resultado: "conflito", instance: "principal", sessao: "s1", operation_id: OPERACAO, codigo: "proxy_de_outra_sessao" }, "conflito"],
    [{ resultado: "incerto", instance: "principal", sessao: "s1", operation_id: OPERACAO }, "incerto"],
    [{ resultado: "indisponivel", instance: "principal", sessao: "s1", operation_id: OPERACAO }, "indisponivel"],
  ])("traduz o desfecho %# em erro com código seguro", async (corpo, codigo) => {
    vi.stubGlobal("fetch", responder(corpo));
    await expect(codigoDe(criar()("s1", OPERACAO))).resolves.toEqual({ mensagem: "proxy_provisionamento_falhou", codigo });
  });

  it.each([
    { ...confirmado, sessao: "outra" },
    { ...confirmado, instance: "outra" },
    { ...confirmado, operation_id: "outro" },
    { ...confirmado, server: "" },
    { ...confirmado, server: "usuario:senha@proxy:8080" },
    { ...confirmado, server: "proxy:8080/caminho" },
    { ...confirmado, password: "nao-deve-sair" },
    { ...confirmado, reutilizado: undefined },
    { resultado: "desconhecido", instance: "principal", sessao: "s1", operation_id: OPERACAO },
    { resultado: "pool_esgotado", instance: "principal", sessao: "s1", operation_id: OPERACAO, server: "proxy:8080" },
  ])("trata corpo 200 inconsistente ou com dados extras como incerto: %#", async (corpo) => {
    vi.stubGlobal("fetch", responder(corpo));
    await expect(codigoDe(criar()("s1", OPERACAO))).resolves.toEqual({ mensagem: "proxy_provisionamento_falhou", codigo: "incerto" });
  });

  it("resposta não-2xx é indisponível e não expõe o corpo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("senha-privada", { status: 500 })));
    await expect(codigoDe(criar()("s1", OPERACAO))).resolves.toEqual({ mensagem: "proxy_provisionamento_falhou", codigo: "indisponivel" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("senha-privada", { status: 401 })));
    await expect(codigoDe(criar()("s1", OPERACAO))).resolves.toEqual({ mensagem: "proxy_provisionamento_falhou", codigo: "indisponivel" });
  });

  it("erro de rede ou timeout depois de enviar é incerto, sem expor a causa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("senha-privada"); }));
    await expect(codigoDe(criar()("s1", OPERACAO))).resolves.toEqual({ mensagem: "proxy_provisionamento_falhou", codigo: "incerto" });
    vi.stubGlobal("fetch", vi.fn((_url: string, opcoes: RequestInit) => new Promise((_resolve, reject) => {
      opcoes.signal!.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    })));
    const rapido = criarProvisionadorDeProxy({ url: "http://n8n.internal/provisionar", token: "t", instancia: "principal", timeoutMs: 10 });
    await expect(codigoDe(rapido("s1", OPERACAO))).resolves.toEqual({ mensagem: "proxy_provisionamento_falhou", codigo: "incerto" });
  });

  it.each(["https://usuario:senha@host/provisionar", "https://host/provisionar?token=segredo", "file:///tmp/arquivo"])(
    "recusa URL insegura ou com segredos: %s", (url) => {
      expect(() => criarProvisionadorDeProxy({ url, token: "token-de-teste", instancia: "principal" })).toThrow(/^proxy_configuracao_invalida$/);
    },
  );

  it("recusa configuração sem token ou instância válidos", () => {
    const base = { url: "http://n8n.internal/provisionar", token: "t", instancia: "principal" };
    expect(() => criarProvisionadorDeProxy({ ...base, token: "" })).toThrow(/^proxy_configuracao_invalida$/);
    expect(() => criarProvisionadorDeProxy({ ...base, instancia: "" })).toThrow(/^proxy_configuracao_invalida$/);
    expect(() => criarProvisionadorDeProxy({ ...base, instancia: " principal" })).toThrow(/^proxy_configuracao_invalida$/);
  });

  it("recusa nome de sessão ou operação inválidos antes de enviar", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(codigoDe(criar()(" ", OPERACAO))).resolves.toMatchObject({ codigo: "indisponivel" });
    await expect(codigoDe(criar()("s1", "não-é-uuid"))).resolves.toMatchObject({ codigo: "indisponivel" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
