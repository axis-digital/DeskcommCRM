import { describe, expect, it } from "vitest";
import { escolherFunilPadrao, type FunilCandidato } from "./funil-padrao";

const f = (over: Partial<FunilCandidato> & { id: string }): FunilCandidato => ({
  name: over.id,
  position: 0,
  is_default: false,
  is_archived: false,
  ...over,
});

describe("escolherFunilPadrao", () => {
  it("devolve o funil marcado como padrão quando ele está vivo", () => {
    const r = escolherFunilPadrao([f({ id: "a", position: 0 }), f({ id: "b", position: 1, is_default: true })]);
    expect(r?.id).toBe("b");
  });

  it("ignora o padrão arquivado e cai no primeiro vivo por posição", () => {
    const r = escolherFunilPadrao([
      f({ id: "arq", position: 0, is_default: true, is_archived: true }),
      f({ id: "z", position: 5 }),
      f({ id: "y", position: 2 }),
    ]);
    expect(r?.id).toBe("y");
  });

  it("sem padrão marcado, devolve o primeiro por posição (não pela ordem do array)", () => {
    const r = escolherFunilPadrao([f({ id: "dois", position: 2 }), f({ id: "um", position: 1 })]);
    expect(r?.id).toBe("um");
  });

  it("lista vazia ou só arquivados devolve null", () => {
    expect(escolherFunilPadrao([])).toBeNull();
    expect(escolherFunilPadrao([f({ id: "x", is_archived: true })])).toBeNull();
  });
});
