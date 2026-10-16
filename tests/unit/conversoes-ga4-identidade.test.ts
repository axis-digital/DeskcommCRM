import { describe, expect, it } from "vitest";
import { normalizarUtm } from "@/lib/leads/origem-do-site";
import {
  lerIdentidadeGa4,
  normalizarIdentidadeGa4,
} from "@/lib/plataformas-de-anuncio/ga4/identidade";

describe("identidade do GA4", () => {
  it("normalizarUtm passa a carregar ga_client_id e ga_session_id", () => {
    expect(
      normalizarUtm({
        utm_source: "google",
        ga_client_id: "123456789.1700000000",
        ga_session_id: "1700000123",
      }),
    ).toEqual({
      utm_source: "google",
      ga_client_id: "123456789.1700000000",
      ga_session_id: "1700000123",
    });
  });

  it("recusa client_id fora do formato do GA4", () => {
    expect(normalizarIdentidadeGa4({ ga_client_id: "GA1.1.123.456" })).toBeNull();
    expect(normalizarIdentidadeGa4({ ga_client_id: "<script>" })).toBeNull();
    expect(normalizarIdentidadeGa4({})).toBeNull();
  });

  it("session_id inválido não derruba o client_id", () => {
    expect(normalizarIdentidadeGa4({ ga_client_id: "1.2", ga_session_id: "abc" })).toEqual({
      clientId: "1.2",
      sessionId: null,
    });
  });

  it("lê do caminho do site (chaves planas)", () => {
    expect(
      lerIdentidadeGa4({ ad_platform: "site", ga_client_id: "111.222", ga_session_id: "333" }),
    ).toEqual({ clientId: "111.222", sessionId: "333" });
  });

  it("lê do caminho do Google (ad_raw.ga)", () => {
    expect(
      lerIdentidadeGa4({
        ad_platform: "google_ads",
        ad_raw: { ga: { ga_client_id: "444.555" } },
      }),
    ).toEqual({ clientId: "444.555", sessionId: null });
  });

  it("contato sem captura não tem identidade", () => {
    expect(lerIdentidadeGa4(null)).toBeNull();
    expect(lerIdentidadeGa4({ ad_platform: "meta_ads", ad_source_id: "ctwa" })).toBeNull();
  });
});
