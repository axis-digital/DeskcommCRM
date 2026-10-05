import { describe, expect, it } from "vitest";
import {
  EVENTO_DE_VENDA_GA4,
  ehEventoDeEtapaDoGa4,
  ehEventoDeEtapaGa4,
  ehEventoDeVendaDoGa4,
  eventoDaEtapaGa4,
  rotuloDoEventoDoGa4,
} from "@/lib/conversoes/regras-ga4";

const ETAPA = "0f8e4a8e-1c2b-4c3d-9e8f-123456789abc";

describe("vocabulário do GA4", () => {
  it("aceita só os eventos recomendados de etapa", () => {
    expect(ehEventoDeEtapaDoGa4("qualify_lead")).toBe(true);
    expect(ehEventoDeEtapaDoGa4("page_view")).toBe(false);
    expect(ehEventoDeEtapaDoGa4("close_convert_lead")).toBe(false);
  });
  it("venda é close_convert_lead ou purchase", () => {
    expect(ehEventoDeVendaDoGa4("purchase")).toBe(true);
    expect(ehEventoDeVendaDoGa4("Purchase")).toBe(false);
  });
  it("chave do livro-razão não colide com Meta nem Google", () => {
    expect(eventoDaEtapaGa4(ETAPA)).toBe(`GA4Etapa:${ETAPA}`);
    expect(ehEventoDeEtapaGa4(`GA4Etapa:${ETAPA}`)).toBe(true);
    expect(ehEventoDeEtapaGa4(`MetaEtapa:${ETAPA}`)).toBe(false);
    expect(EVENTO_DE_VENDA_GA4).toBe("GA4:Venda");
  });
  it("rótulo humano com fallback para o próprio valor", () => {
    expect(rotuloDoEventoDoGa4("qualify_lead")).toBe("Lead qualificado");
    expect(rotuloDoEventoDoGa4("x")).toBe("x");
  });
});
