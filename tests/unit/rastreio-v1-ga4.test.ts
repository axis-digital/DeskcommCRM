// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CODIGO = readFileSync(join(process.cwd(), "public/rastreio/v1.js"), "utf8");

// Os listeners de documento de uma carga anterior não saem do jsdom. Cada carga
// ganha um telefone próprio, e o clique usa esse telefone: a carga antiga não
// reconhece o link e não o reescreve.
let telefone = "";
let cargas = 0;

function carregar(atributos: Record<string, string>, url: string) {
  cargas += 1;
  telefone = `55119${String(cargas).padStart(8, "0")}`;
  window.history.replaceState({}, "", url);
  const s = document.createElement("script");
  s.src = "https://crm.exemplo.com/rastreio/v1.js";
  const comTelefone = { ...atributos, "data-meta-whatsapp": telefone };
  for (const [k, v] of Object.entries(comTelefone)) s.setAttribute(k, v);
  document.head.appendChild(s);
  Object.defineProperty(document, "currentScript", { value: s, configurable: true });
  delete (window as unknown as Record<string, unknown>).__rastreioCaptureV1;
  new Function(CODIGO)();
  Object.defineProperty(document, "currentScript", { value: null, configurable: true });
}

function clicar(): URL {
  const a = document.createElement("a");
  a.href = `https://wa.me/${telefone}`;
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return new URL(a.href);
}

afterEach(() => {
  document.body.innerHTML = "";
  document.cookie.split(";").forEach((c) => {
    document.cookie = `${c.split("=")[0]!.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});

describe("rastreio/v1.js — identidade do GA4", () => {
  it("anexa client_id e session_id (GS2) quando data-ga4 está ligado", () => {
    document.cookie = "_ga=GA1.1.123456789.1700000000; path=/";
    document.cookie = "_ga_ABC123=GS2.1.s1700000999$o3$g1$t1700001000; path=/";
    carregar(
      { "data-org": "axis", "data-meta-whatsapp": "5511999999999", "data-ga4": "G-ABC123" },
      "/?utm_source=facebook",
    );
    const destino = clicar();
    expect(destino.searchParams.get("ga_client_id")).toBe("123456789.1700000000");
    expect(destino.searchParams.get("ga_session_id")).toBe("1700000999");
  });

  it("aceita o formato antigo GS1 da sessão", () => {
    document.cookie = "_ga=GA1.2.11.22; path=/";
    document.cookie = "_ga_ABC123=GS1.1.1700000555.4.1.1700000600.0.0.0; path=/";
    carregar(
      { "data-org": "axis", "data-meta-whatsapp": "5511999999999", "data-ga4": "G-ABC123" },
      "/?utm_source=facebook",
    );
    expect(clicar().searchParams.get("ga_session_id")).toBe("1700000555");
  });

  it("sem data-ga4 não lê cookie nenhum", () => {
    document.cookie = "_ga=GA1.1.123456789.1700000000; path=/";
    carregar(
      { "data-org": "axis", "data-meta-whatsapp": "5511999999999" },
      "/?utm_source=facebook",
    );
    expect(clicar().searchParams.has("ga_client_id")).toBe(false);
  });

  it("visita orgânica sem UTM também manda o client_id", () => {
    document.cookie = "_ga=GA1.1.123456789.1700000000; path=/";
    carregar(
      { "data-org": "axis", "data-meta-whatsapp": "5511999999999", "data-ga4": "G-ABC123" },
      "/",
    );
    expect(clicar().searchParams.get("ga_client_id")).toBe("123456789.1700000000");
  });

  it("cookie malformado não quebra o link", () => {
    document.cookie = "_ga=lixo; path=/";
    carregar(
      { "data-org": "axis", "data-meta-whatsapp": "5511999999999", "data-ga4": "G-ABC123" },
      "/?utm_source=facebook",
    );
    const destino = clicar();
    expect(destino.pathname).toMatch(/\/api\/v1\/anuncios\/meta\/axis$/);
    expect(destino.searchParams.has("ga_client_id")).toBe(false);
  });
});
