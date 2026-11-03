import { describe, expect, it } from "vitest";
import { confirmarProxyAntesDoInicio, ErroDeProxy, type CodigoDeProxy } from "./proxy-antes-do-inicio";

const waha = (server: unknown = "proxy:8080") => ({
  getVerifiedSession: async () => ({ name: "s1", status: "STOPPED", config: { proxy: { server } } }),
});
const recibo = { sessao: "s1", server: "proxy:8080", confirmado: true };

async function falhou(p: Promise<unknown>) {
  return p.then(() => null, (e: unknown) => e);
}

describe("código seguro da barreira do proxy", () => {
  it.each<CodigoDeProxy>(["pool_esgotado", "conflito", "incerto", "indisponivel"])(
    "preserva o código %s do provisionador sem mudar a mensagem", async (codigo) => {
      const provisionar = async () => { throw Object.assign(new Error("senha-privada"), { codigo }); };
      const erro = await falhou(confirmarProxyAntesDoInicio("s1", provisionar, waha()));
      expect(erro).toBeInstanceOf(ErroDeProxy);
      expect(erro).toMatchObject({ message: "proxy_nao_confirmado", codigo });
    },
  );

  it("trata falha sem código, ou com código desconhecido, como incerto", async () => {
    for (const erroOriginal of [new Error("senha-privada"), Object.assign(new Error("x"), { codigo: "inventado" })]) {
      const erro = await falhou(confirmarProxyAntesDoInicio("s1", async () => { throw erroOriginal; }, waha()));
      expect(erro).toMatchObject({ message: "proxy_nao_confirmado", codigo: "incerto" });
    }
  });

  it("pós-condição divergente no WAHA é incerto, nunca sucesso", async () => {
    const erro = await falhou(confirmarProxyAntesDoInicio("s1", async () => recibo, waha("outro:8080")));
    expect(erro).toMatchObject({ message: "proxy_nao_confirmado", codigo: "incerto" });
  });

  it("não vaza endereço nem credencial na exceção", async () => {
    const erro = (await falhou(confirmarProxyAntesDoInicio("s1", async () => recibo, waha("outro:8080")))) as Error;
    expect(JSON.stringify({ m: erro.message, s: erro.stack?.split("\n")[0] })).not.toMatch(/proxy:8080|outro:8080/);
  });
});
