import { describe, expect, it } from "vitest";

import {
  paresAplicaveis,
  sugerirRegrasGa4,
  type EtapaParaSugestao,
  type FunilParaSugestao,
} from "@/lib/conversoes/regras-sugeridas-ga4";

const FUNIL_PRODUTO: FunilParaSugestao = {
  id: "p-produto",
  nome: "Loja",
  settings: { objetivo: "vender_produto", fields: [] },
};
const FUNIL_SERVICO: FunilParaSugestao = {
  id: "p-servico",
  nome: "Serviços",
  settings: { objetivo: "vender_servico" },
};
const FUNIL_SEM_OBJETIVO: FunilParaSugestao = { id: "p-livre", nome: "Livre", settings: {} };

function etapa(id: string, pipelineId: string, passo: string | null): EtapaParaSugestao {
  return { id, pipelineId, nome: `Etapa ${id}`, passo };
}

describe("sugerirRegrasGa4 — funis × etapas × regras existentes", () => {
  it("funil de produto segue a jornada de e-commerce, inclusive a perda", () => {
    const r = sugerirRegrasGa4({
      funis: [FUNIL_PRODUTO],
      etapas: [
        etapa("s1", "p-produto", "new"),
        etapa("s2", "p-produto", "qualifying"),
        etapa("s3", "p-produto", "qualified"),
        etapa("s4", "p-produto", "negotiating"),
        etapa("s5", "p-produto", "lost"),
      ],
      regras: [],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pipelineId: "p-produto", funil: "Loja", objetivo: "vender_produto" });
    expect(r[0]!.propostas.map((p) => [p.stageId, p.evento])).toEqual([
      ["s1", "generate_lead"],
      ["s2", "view_item"],
      ["s3", "add_to_cart"],
      ["s4", "begin_checkout"],
      ["s5", "close_unconvert_lead"],
    ]);
    expect(r[0]!.propostas[0]).toEqual({
      stageId: "s1",
      etapa: "Etapa s1",
      evento: "generate_lead",
      jaTemRegra: false,
    });
  });

  it("funil de serviço: qualified é qualify_lead e negotiating é begin_checkout", () => {
    const [f] = sugerirRegrasGa4({
      funis: [FUNIL_SERVICO],
      etapas: [etapa("a", "p-servico", "qualified"), etapa("b", "p-servico", "negotiating")],
      regras: [],
    });
    expect(f!.objetivo).toBe("vender_servico");
    expect(f!.propostas.map((p) => p.evento)).toEqual(["qualify_lead", "begin_checkout"]);
  });

  it("funil sem objetivo é tratado como funil de leads (objetivo null)", () => {
    const [f] = sugerirRegrasGa4({
      funis: [FUNIL_SEM_OBJETIVO],
      etapas: [etapa("a", "p-livre", "qualifying"), etapa("b", "p-livre", "qualified")],
      regras: [],
    });
    expect(f!.objetivo).toBeNull();
    expect(f!.propostas.map((p) => p.evento)).toEqual(["working_lead", "qualify_lead"]);
  });

  it("objetivo inválido no settings também cai no funil de leads", () => {
    const [f] = sugerirRegrasGa4({
      funis: [{ id: "x", nome: "X", settings: { objetivo: "vender_nuvens" } }],
      etapas: [etapa("a", "x", "qualified")],
      regras: [],
    });
    expect(f!.objetivo).toBeNull();
    expect(f!.propostas[0]!.evento).toBe("qualify_lead");
  });

  it("etapa sem passo, com passo desconhecido ou sem sugestão (contacted, won) fica de fora", () => {
    const [f] = sugerirRegrasGa4({
      funis: [FUNIL_PRODUTO],
      etapas: [
        etapa("sem-passo", "p-produto", null),
        etapa("estranho", "p-produto", "pagamento"),
        etapa("respondido", "p-produto", "contacted"),
        etapa("ganho", "p-produto", "won"),
        etapa("novo", "p-produto", "new"),
      ],
      regras: [],
    });
    expect(f!.propostas.map((p) => p.stageId)).toEqual(["novo"]);
  });

  it("etapa que já tem regra aparece marcada como já configurada", () => {
    const [f] = sugerirRegrasGa4({
      funis: [FUNIL_PRODUTO],
      etapas: [etapa("s1", "p-produto", "new"), etapa("s2", "p-produto", "qualifying")],
      regras: [{ stageId: "s1" }],
    });
    expect(f!.propostas.map((p) => [p.stageId, p.jaTemRegra])).toEqual([
      ["s1", true],
      ["s2", false],
    ]);
  });

  it("funil arquivado e etapa arquivada ficam de fora", () => {
    const r = sugerirRegrasGa4({
      funis: [{ ...FUNIL_PRODUTO, arquivado: true }, FUNIL_SERVICO],
      etapas: [
        etapa("s1", "p-produto", "new"),
        { ...etapa("s2", "p-servico", "new"), arquivada: true },
        etapa("s3", "p-servico", "qualified"),
      ],
      regras: [],
    });
    expect(r.map((f) => f.pipelineId)).toEqual(["p-servico"]);
    expect(r[0]!.propostas.map((p) => p.stageId)).toEqual(["s3"]);
  });

  it("funil sem nenhuma proposta não aparece; etapa de funil desconhecido é ignorada", () => {
    const r = sugerirRegrasGa4({
      funis: [FUNIL_PRODUTO, FUNIL_SERVICO],
      etapas: [etapa("s1", "p-produto", "contacted"), etapa("orfa", "p-outro", "new")],
      regras: [],
    });
    expect(r).toEqual([]);
  });

  it("mantém a ordem dos funis e das etapas recebida", () => {
    const r = sugerirRegrasGa4({
      funis: [FUNIL_SERVICO, FUNIL_PRODUTO],
      etapas: [
        etapa("b", "p-produto", "qualifying"),
        etapa("a", "p-produto", "new"),
        etapa("c", "p-servico", "new"),
      ],
      regras: [],
    });
    expect(r.map((f) => f.pipelineId)).toEqual(["p-servico", "p-produto"]);
    expect(r[1]!.propostas.map((p) => p.stageId)).toEqual(["b", "a"]);
  });
});

describe("paresAplicaveis", () => {
  it("devolve só stageId → evento das etapas sem regra", () => {
    const sugestoes = sugerirRegrasGa4({
      funis: [FUNIL_PRODUTO],
      etapas: [etapa("s1", "p-produto", "new"), etapa("s2", "p-produto", "qualified")],
      regras: [{ stageId: "s1" }],
    });
    expect([...paresAplicaveis(sugestoes)]).toEqual([["s2", "add_to_cart"]]);
  });
});
