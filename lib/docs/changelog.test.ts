import { describe, expect, it } from "vitest";

import { PERIODOS, TIPOS_DE_MUDANCA } from "./changelog";

/**
 * O changelog público é lido por quem usa o produto, não por quem opera a
 * infraestrutura. O que este arquivo guarda é a fronteira entre as duas
 * audiências: nada de PR privado, digest, staging ou migration numa página
 * que qualquer visitante abre sem login.
 */
const TODAS_AS_MUDANCAS = PERIODOS.flatMap((p) => p.mudancas);

describe("changelog público — forma", () => {
  it("tem períodos, e cada período tem ao menos uma mudança", () => {
    expect(PERIODOS.length).toBeGreaterThan(0);
    for (const periodo of PERIODOS) {
      expect(periodo.mudancas.length, `período "${periodo.titulo}" vazio`).toBeGreaterThan(0);
    }
  });

  it("os ids dos períodos são únicos e servem de âncora (#id)", () => {
    const ids = PERIODOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("todo tipo de mudança é conhecido e todo texto termina em ponto", () => {
    for (const m of TODAS_AS_MUDANCAS) {
      expect(TIPOS_DE_MUDANCA, `tipo desconhecido em "${m.texto}"`).toContain(m.tipo);
      expect(m.texto.trim().endsWith("."), `sem ponto final: "${m.texto}"`).toBe(true);
    }
  });

  it("nenhum texto se repete", () => {
    const textos = TODAS_AS_MUDANCAS.map((m) => m.texto);
    expect(new Set(textos).size).toBe(textos.length);
  });

  it("os períodos vêm do mais recente para o mais antigo", () => {
    const inicios = PERIODOS.map((p) => p.inicio);
    expect([...inicios].sort().reverse()).toEqual(inicios);
  });
});

describe("changelog público — o que NÃO pode aparecer", () => {
  // Cada padrão é um vazamento medido na versão interna da página: número de
  // PR de repositório privado, link do GitHub, vocabulário de promoção de
  // imagem e de sincronização com a upstream.
  const PROIBIDOS: ReadonlyArray<readonly [string, RegExp]> = [
    ["número de PR", /#\d+/],
    ["link do GitHub", /github\.com/i],
    ["staging", /staging/i],
    ["digest de imagem", /digest/i],
    ["rollback", /rollback/i],
    ["upstream", /upstream/i],
    ["cherry-pick", /cherry-pick/i],
    ["migration", /migration/i],
  ];

  it.each(PROIBIDOS)("nenhum texto cita %s", (_nome, padrao) => {
    const achados = TODAS_AS_MUDANCAS.filter((m) => padrao.test(m.texto)).map((m) => m.texto);
    expect(achados).toEqual([]);
  });

  it("não existe tipo de operação ou docs: a versão pública só mostra o que o usuário vê", () => {
    expect([...TIPOS_DE_MUDANCA].sort()).toEqual(["corrigido", "interface", "novo"]);
  });
});
