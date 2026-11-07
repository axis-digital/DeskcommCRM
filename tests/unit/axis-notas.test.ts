/**
 * Notas exclusivas do fork Axis (`docs/axis-notas/`).
 *
 * O fork não corta release nem publica GitHub Release, então suas notas não
 * moram em `.changes/` (que é o acervo que o corte do upstream consome e que o
 * gate `scripts/acervo-cabe-na-tela.ts` mede). Elas usam o MESMO formato de
 * fragmento, validado aqui com a régua do upstream (`parseFragmento`).
 *
 * `pnpm release:conferir`, `tests/unit/fragmentos-de-release.test.ts`, o gate do
 * acervo e a skill genérica `deskcomm-contribuir` só olham `.changes/`: nenhum
 * deles enxerga este diretório. Quem valida as notas do fork é este arquivo.
 *
 * O que este teste NÃO detecta: uma nota do fork deixada (ou criada por engano)
 * em `.changes/` com nome que não existe aqui. Distinguir nota do fork de
 * fragmento do upstream exige a história do `upstream/main`, que não está no
 * checkout do CI. Isso fica com quem revisa (regra no `CLAUDE.md`, seção
 * "Notas exclusivas do fork Axis").
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FragmentoInvalido, parseFragmento } from "@/lib/release/fragmento";

const RAIZ = process.cwd();
const DIR_NOTAS = path.join(RAIZ, "docs/axis-notas");
const DIR_FRAGMENTOS = path.join(RAIZ, ".changes");

const NOME_DE_NOTA = /^[a-z0-9][a-z0-9-]*\.md$/;

interface Entrada {
  nome: string;
  ehArquivo: boolean;
}

/** Tudo que não é arquivo `.md` com nome de nota é inesperado — inclusive subpasta e dotfile. */
function entradasInesperadas(entradas: readonly Entrada[]): string[] {
  return entradas
    .filter((e) => !e.ehArquivo || !NOME_DE_NOTA.test(e.nome))
    .map((e) => (e.ehArquivo ? e.nome : `${e.nome}/`))
    .sort();
}

/** Nomes `.md` presentes nos dois diretórios (a mesma nota não pode estar nos dois). */
function nomesRepetidos(notas: readonly string[], fragmentos: readonly string[]): string[] {
  const doUpstream = new Set(fragmentos.filter((f) => f.endsWith(".md")));
  return notas.filter((n) => n.endsWith(".md") && doUpstream.has(n)).sort();
}

function listar(dir: string): Entrada[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((d) => ({ nome: d.name, ehArquivo: d.isFile() }));
}

const EXIGE_ACAO_COM_AVISO = [
  "---",
  "impacto: exige_acao",
  "secao: alterado",
  "titulo: Atualização",
  "---",
  "",
  "Corpo.",
  "",
  "## Requer atenção",
  "",
  "Rode o passo X antes de atualizar.",
].join("\n");

describe("notas exclusivas do fork (docs/axis-notas/)", () => {
  it("o diretório existe e não está vazio (guarda de vacuidade)", () => {
    expect(fs.existsSync(DIR_NOTAS), "docs/axis-notas/ sumiu").toBe(true);
    expect(listar(DIR_NOTAS).length).toBeGreaterThan(0);
  });

  it("só contém arquivos .md com nome de nota — nada de subpasta, dotfile ou outra extensão", () => {
    expect(entradasInesperadas(listar(DIR_NOTAS))).toEqual([]);
  });

  it("cada nota passa na mesma régua dos fragmentos do upstream", () => {
    const notas = listar(DIR_NOTAS).filter((e) => e.ehArquivo && NOME_DE_NOTA.test(e.nome));
    for (const { nome } of notas) {
      expect(
        () => parseFragmento(nome, fs.readFileSync(path.join(DIR_NOTAS, nome), "utf8")),
        nome,
      ).not.toThrow();
    }
  });

  it("nenhum nome aparece ao mesmo tempo em docs/axis-notas/ e em .changes/", () => {
    const fragmentos = fs.existsSync(DIR_FRAGMENTOS) ? fs.readdirSync(DIR_FRAGMENTOS) : [];
    expect(nomesRepetidos(fs.readdirSync(DIR_NOTAS), fragmentos)).toEqual([]);
  });
});

describe("as guardas estão vivas (controles)", () => {
  it("entradasInesperadas aponta subpasta, dotfile, extensão errada e maiúscula; aceita nota válida", () => {
    const achadas = entradasInesperadas([
      { nome: "nota-valida.md", ehArquivo: true },
      { nome: ".gitkeep", ehArquivo: true },
      { nome: "rascunho.txt", ehArquivo: true },
      { nome: "Nota.md", ehArquivo: true },
      { nome: "antigas", ehArquivo: false },
      { nome: "pasta.md", ehArquivo: false },
    ]);
    expect(achadas).toEqual([".gitkeep", "Nota.md", "antigas/", "pasta.md/", "rascunho.txt"]);
  });

  it("nomesRepetidos acha o nome comum e ignora o que não é .md", () => {
    expect(nomesRepetidos(["a.md", "b.md", ".gitkeep"], ["b.md", ".gitkeep", "c.md"])).toEqual([
      "b.md",
    ]);
    expect(nomesRepetidos(["a.md"], [])).toEqual([]);
  });

  it("parseFragmento recusa nota sem frontmatter", () => {
    expect(() => parseFragmento("invalida.md", "sem frontmatter")).toThrow(FragmentoInvalido);
  });

  it("parseFragmento recusa exige_acao sem o bloco de aviso", () => {
    const semAviso = EXIGE_ACAO_COM_AVISO.split("\n\n## Requer atenção")[0] ?? "";
    expect(semAviso).not.toContain("Requer atenção");
    expect(() => parseFragmento("aviso.md", semAviso)).toThrow(FragmentoInvalido);
  });

  it("parseFragmento ACEITA exige_acao com o bloco de aviso e devolve o aviso separado do corpo", () => {
    const nota = parseFragmento("aviso.md", EXIGE_ACAO_COM_AVISO);
    expect(nota.impacto).toBe("exige_acao");
    expect(nota.corpo).toBe("Corpo.");
    expect(nota.atencao).toBe("Rode o passo X antes de atualizar.");
  });

  it("parseFragmento recusa bloco de aviso com impacto que não é exige_acao", () => {
    const avisoSemImpacto = EXIGE_ACAO_COM_AVISO.replace(
      "impacto: exige_acao",
      "impacto: nada_mudou",
    );
    expect(() => parseFragmento("aviso.md", avisoSemImpacto)).toThrow(FragmentoInvalido);
  });
});
