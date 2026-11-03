import { describe, expect, it } from "vitest";
import { planejarInventarioDeProxies } from "./inventario-proxies";

describe("inventário de proxies por sessão", () => {
  const p = (id: number, server: string, status: "livre" | "atribuido", sessao: string | null = null) =>
    ({ id, server, status, sessao, valido: true });
  const s = (nome: string, server: string, status = "WORKING") => ({ nome, server, status });

  it("propõe registrar somente proxy livre de sessão ativa e única", () => {
    expect(planejarInventarioDeProxies([s("a", "proxy:1")], [p(1, "proxy:1", "livre")])).toEqual({
      atribuicoes: [{ proxyId: 1, sessao: "a" }], conflitos: [],
    });
  });

  it("não altera proxy já atribuído à mesma sessão", () => {
    expect(planejarInventarioDeProxies([s("a", "proxy:1")], [p(1, "proxy:1", "atribuido", "a")])).toEqual({
      atribuicoes: [], conflitos: [],
    });
  });

  it("bloqueia proxy compartilhado mesmo se a outra sessão falhou", () => {
    const plano = planejarInventarioDeProxies([s("a", "proxy:1"), s("b", "proxy:1", "FAILED")], [p(1, "proxy:1", "livre")]);
    expect(plano.atribuicoes).toEqual([]);
    expect(plano.conflitos).toContainEqual({ sessao: "a", motivo: "proxy_compartilhado" });
  });

  it("não atribui um segundo proxy à sessão que já tem outro no pool", () => {
    const plano = planejarInventarioDeProxies([s("a", "proxy:2")], [p(1, "proxy:1", "atribuido", "a"), p(2, "proxy:2", "livre")]);
    expect(plano.atribuicoes).toEqual([]);
    expect(plano.conflitos).toContainEqual({ sessao: "a", motivo: "atribuicao_divergente" });
  });

  it("não atribui proxy reservado a outra sessão", () => {
    const plano = planejarInventarioDeProxies([s("a", "proxy:1")], [p(1, "proxy:1", "atribuido", "b")]);
    expect(plano.atribuicoes).toEqual([]);
    expect(plano.conflitos).toContainEqual({ sessao: "a", motivo: "proxy_atribuido_a_outra_sessao" });
  });

  it("sinaliza proxy ausente ou inválido e ignora sessão parada para novas atribuições", () => {
    const plano = planejarInventarioDeProxies([s("a", "proxy:1"), s("b", "proxy:2"), s("c", "proxy:3", "STOPPED")], [
      { ...p(1, "proxy:2", "livre"), valido: false }, p(2, "proxy:3", "livre"),
    ]);
    expect(plano.atribuicoes).toEqual([]);
    expect(plano.conflitos).toContainEqual({ sessao: "a", motivo: "proxy_fora_do_pool" });
    expect(plano.conflitos).toContainEqual({ sessao: "b", motivo: "proxy_invalido" });
  });

  it("não atribui uma linha marcada inválida mesmo quando valid continua true", () => {
    const plano = planejarInventarioDeProxies([s("a", "proxy:1")], [{ ...p(1, "proxy:1", "livre"), status: "invalido" }]);
    expect(plano.atribuicoes).toEqual([]);
    expect(plano.conflitos).toEqual([{ sessao: "a", motivo: "proxy_invalido" }]);
  });

  it("não atribui um proxy livre que ainda tenha uma sessão registrada", () => {
    const plano = planejarInventarioDeProxies([s("a", "proxy:1")], [p(1, "proxy:1", "livre", "b")]);
    expect(plano.atribuicoes).toEqual([]);
    expect(plano.conflitos).toEqual([{ sessao: "a", motivo: "atribuicao_divergente" }]);
  });
});
