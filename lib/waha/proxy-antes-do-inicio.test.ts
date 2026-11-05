import { describe, expect, it, vi } from "vitest";
import { confirmarProxyAntesDoInicio } from "./proxy-antes-do-inicio";

describe("barreira do proxy por sessão", () => {
  const transport = (server: unknown = "proxy:8080", name = "s1", status = "STOPPED") => ({
    getVerifiedSession: vi.fn(async () => ({ name, status, config: { proxy: { server } } })),
  });

  it("só confirma após provisionar e reler o mesmo proxy da mesma sessão", async () => {
    const provisionar = vi.fn(async () => ({ sessao: "s1", server: "proxy:8080", confirmado: true }));
    const waha = transport();
    await confirmarProxyAntesDoInicio("s1", provisionar, waha);
    expect(provisionar).toHaveBeenCalledWith("s1");
    expect(provisionar.mock.invocationCallOrder[0]).toBeLessThan(waha.getVerifiedSession.mock.invocationCallOrder[0]!);
  });

  it.each([
    { sessao: "outra", server: "proxy:8080", confirmado: true },
    { sessao: "s1", server: "proxy:8080", confirmado: false },
    { sessao: "s1", server: "", confirmado: true },
  ])("recusa confirmação inválida: $sessao", async (resultado) => {
    const waha = transport();
    await expect(confirmarProxyAntesDoInicio("s1", async () => resultado, waha)).rejects.toThrow("proxy_nao_confirmado");
  });

  it("recusa divergência e ausência no GET da sessão", async () => {
    const provisionar = async () => ({ sessao: "s1", server: "proxy:8080", confirmado: true });
    await expect(confirmarProxyAntesDoInicio("s1", provisionar, transport("outro:8080"))).rejects.toThrow("proxy_nao_confirmado");
    await expect(confirmarProxyAntesDoInicio("s1", provisionar, { getVerifiedSession: async () => null })).rejects.toThrow("proxy_nao_confirmado");
    await expect(confirmarProxyAntesDoInicio("s1", provisionar, transport("proxy:8080", "outra"))).rejects.toThrow("proxy_nao_confirmado");
    await expect(confirmarProxyAntesDoInicio("s1", provisionar, transport("proxy:8080", "s1", "WORKING"))).rejects.toThrow("proxy_nao_confirmado");
  });

  it("falha sem revelar o erro ou a credencial do provisionador", async () => {
    const provisionar = async () => { throw new Error("senha-privada"); };
    await expect(confirmarProxyAntesDoInicio("s1", provisionar, transport())).rejects.toThrow(/^proxy_nao_confirmado$/);
  });
});
