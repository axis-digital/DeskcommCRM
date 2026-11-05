import { describe, expect, it } from "vitest";

import { CODIGOS_DE_PROXY } from "@/lib/waha/proxy-antes-do-inicio";
import { falhaDoCodigoDeProxy } from "@/lib/waha/proxy-na-rota";

import { MENSAGEM_DO_PROXY, motivoDeProxy } from "./motivo-de-proxy";

describe("motivoDeProxy", () => {
  it.each(CODIGOS_DE_PROXY)("reconhece proxy_%s gravado em status_reason", (codigo) => {
    expect(motivoDeProxy(`proxy_${codigo}`)).toBe(codigo);
  });

  it.each([
    null,
    undefined,
    "",
    "connection_repair_required",
    "proxy_",
    "proxy_inventado",
    "PROXY_INCERTO",
    "proxy_incerto_e_mais_coisa",
  ])("devolve null para %j (só o vocabulário fechado conta)", (motivo) => {
    expect(motivoDeProxy(motivo)).toBeNull();
  });
});

describe("MENSAGEM_DO_PROXY", () => {
  it("tem uma mensagem para cada código — código novo sem texto reprova aqui", () => {
    expect(Object.keys(MENSAGEM_DO_PROXY).sort()).toEqual([...CODIGOS_DE_PROXY].sort());
  });

  it.each(CODIGOS_DE_PROXY)("%s não carrega endereço, porta nem credencial", (codigo) => {
    const texto = MENSAGEM_DO_PROXY[codigo];
    expect(texto).not.toMatch(/https?:|socks|@|\d+\.\d+\.\d+\.\d+|:\d{2,5}\b/i);
  });

  it("é a MESMA fonte da resposta da API (a tela e a rota nunca divergem)", () => {
    for (const codigo of CODIGOS_DE_PROXY) {
      expect(falhaDoCodigoDeProxy(codigo).message).toBe(MENSAGEM_DO_PROXY[codigo]);
    }
  });
});
