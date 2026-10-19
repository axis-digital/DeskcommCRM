import { describe, expect, it } from "vitest";
import { rotaEstaAtiva } from "./rota-ativa";

describe("rotaEstaAtiva", () => {
  const funis = { href: "/app/kanban", ativoEm: ["/app/pipelines"] as const };

  it("ativa na própria rota e nas filhas", () => {
    expect(rotaEstaAtiva("/app/kanban", funis)).toBe(true);
    expect(rotaEstaAtiva("/app/kanban/funis", funis)).toBe(true);
  });

  it("ativa no quadro de qualquer funil (ativoEm)", () => {
    expect(rotaEstaAtiva("/app/pipelines/5b1c", funis)).toBe(true);
  });

  it("não ativa por prefixo de texto que não é segmento", () => {
    expect(rotaEstaAtiva("/app/kanbanx", funis)).toBe(false);
    expect(rotaEstaAtiva("/app/pipelinesx/1", funis)).toBe(false);
  });

  it("sem ativoEm, mantém o comportamento antigo", () => {
    expect(rotaEstaAtiva("/app/inbox", { href: "/app/inbox" })).toBe(true);
    expect(rotaEstaAtiva("/app/pipelines/1", { href: "/app/inbox" })).toBe(false);
  });
});
