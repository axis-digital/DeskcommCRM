import { describe, it, expect } from "vitest";

import { reescreverOrigemDaMidia as reescrever } from "./media-url";

const PUBLICA = "https://deskcomm.axisaceleradora.com.br";
const ASSINADA = `${PUBLICA}/storage/v1/object/sign/whatsapp-media/org/conv/a.png?token=abc.def-_x`;

describe("reescreverOrigemDaMidia", () => {
  it("troca só a origem e preserva caminho e token byte a byte", () => {
    expect(reescrever(ASSINADA, PUBLICA, "http://deskcommcrm-caddy-1")).toBe(
      "http://deskcommcrm-caddy-1/storage/v1/object/sign/whatsapp-media/org/conv/a.png?token=abc.def-_x",
    );
  });

  it("sem base interna configurada, devolve a URL como veio", () => {
    expect(reescrever(ASSINADA, PUBLICA, "")).toBe(ASSINADA);
    expect(reescrever(ASSINADA, PUBLICA, "   ")).toBe(ASSINADA);
  });

  it("mídia hospedada em outro domínio não é tocada", () => {
    const externa = "https://cdn.exemplo.com/foto.png?x=1";
    expect(reescrever(externa, PUBLICA, "http://caddy")).toBe(externa);
  });

  it("base com barra final ou caminho usa só a origem dela", () => {
    expect(reescrever(ASSINADA, PUBLICA, "http://caddy/")).toBe(
      "http://caddy/storage/v1/object/sign/whatsapp-media/org/conv/a.png?token=abc.def-_x",
    );
    expect(reescrever(ASSINADA, PUBLICA, "http://caddy:8080/qualquer")).toBe(
      "http://caddy:8080/storage/v1/object/sign/whatsapp-media/org/conv/a.png?token=abc.def-_x",
    );
  });

  it("entrada malformada nunca lança: devolve a URL original", () => {
    expect(reescrever("não-é-url", PUBLICA, "http://caddy")).toBe("não-é-url");
    expect(reescrever(ASSINADA, PUBLICA, "::lixo")).toBe(ASSINADA);
    expect(reescrever(ASSINADA, "", "http://caddy")).toBe(ASSINADA);
  });
});
