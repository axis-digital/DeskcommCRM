import { afterEach, describe, expect, it, vi } from "vitest";
import { barreiraDeProxyDaRota, falhaDeProxyDaConexao } from "./proxy-na-rota";
import { ChannelConnectionError } from "@/lib/channels/connect-waha";

const leitor = { getVerifiedSession: vi.fn() };

afterEach(() => vi.unstubAllEnvs());

describe("barreiraDeProxyDaRota", () => {
  it("sem variáveis do pool: ok sem barreira (self-host comum)", () => {
    expect(barreiraDeProxyDaRota(leitor, {})).toEqual({ ok: true, barreira: undefined });
  });

  it("configuração inválida vira 503 com código estável e sem vazar valores", () => {
    const r = barreiraDeProxyDaRota(leitor, {
      WAHA_PROXY_POOL_URL: "http://x/y",
      WAHA_PROXY_POOL_TOKEN: "segredo-que-nao-pode-vazar",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.falha).toMatchObject({ code: "proxy_pool_misconfigured", status: 503 });
    expect(JSON.stringify(r)).not.toContain("segredo-que-nao-pode-vazar");
  });
});

describe("falhaDeProxyDaConexao", () => {
  it.each([
    ["pool_esgotado", 503],
    ["conflito", 409],
    ["incerto", 502],
    ["indisponivel", 503],
  ])("traduz %s em mensagem de próximo passo sem dado sensível", (codigo, status) => {
    const f = falhaDeProxyDaConexao(
      new ChannelConnectionError(`connection_proxy_${codigo}`, status, { proxy: codigo }),
    );
    expect(f).toMatchObject({ code: `connection_proxy_${codigo}`, status });
    expect(f!.message.length).toBeGreaterThan(20);
    expect(f!.message).not.toMatch(/https?:|@|senha|password/i);
  });

  it("devolve null para qualquer outro erro", () => {
    expect(
      falhaDeProxyDaConexao(new ChannelConnectionError("connection_in_progress", 409)),
    ).toBeNull();
    expect(falhaDeProxyDaConexao(new Error("x"))).toBeNull();
  });
});
