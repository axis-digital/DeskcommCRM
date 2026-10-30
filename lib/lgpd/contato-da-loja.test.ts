/**
 * Achar o contato da loja pelo id do cliente na Nuvemshop (apagamento e cópia dos dados do titular).
 *
 * O defeito que isto guarda: a busca procurava `source_metadata->>nuvemshop_customer_id`, uma
 * chave que NINGUÉM grava — o sync grava `customer_id` junto de `store_id`. Só o plano B, por
 * e-mail, funcionava, e o contato sem e-mail (ou com outro) ficava fora do alcance do direito do
 * titular. A busca agora tenta a chave do sync e depois a legada.
 *
 * Errar aqui tem dois custos opostos: não achar deixa o titular sem resposta; achar a pessoa
 * ERRADA anonimiza quem não pediu. Por isso a busca ambígua não escolhe ninguém.
 */
import { describe, expect, it } from "vitest";

import { acharContatoDaLoja } from "./contato-da-loja";

const ORG = "11111111-1111-4111-8111-111111111111";

type Resultado = { data: { id: string } | null; error: { message: string } | null };

/** Um `admin` que devolve, na ordem, o resultado de cada consulta e anota os filtros de cada uma. */
function adminDeMentira(resultados: Resultado[]) {
  const consultas: Array<{ tabela: string; filtros: Array<[string, ...unknown[]]> }> = [];
  const admin = {
    from(tabela: string) {
      const consulta = { tabela, filtros: [] as Array<[string, ...unknown[]]> };
      consultas.push(consulta);
      const q: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "not"]) {
        q[metodo] = (...args: unknown[]) => {
          consulta.filtros.push([metodo, ...args]);
          return q;
        };
      }
      q.maybeSingle = async () => resultados[consultas.length - 1] ?? { data: null, error: null };
      return q;
    },
  };
  return { admin: admin as never, consultas };
}

describe("acharContatoDaLoja", () => {
  it("⭐ acha o contato criado pelo sync: customer_id com store_id, que é o que o sync grava", async () => {
    const { admin, consultas } = adminDeMentira([{ data: { id: "c-1" }, error: null }]);

    const r = await acharContatoDaLoja(admin, ORG, "4567");

    expect(r.contato).toEqual({ id: "c-1" });
    expect(consultas).toHaveLength(1);
    expect(consultas[0]!.filtros).toContainEqual(["eq", "organization_id", ORG]);
    expect(consultas[0]!.filtros).toContainEqual(["eq", "source_metadata->>customer_id", "4567"]);
    // A presença de store_id é o que prova que foi o sync da Nuvemshop quem gravou o customer_id.
    expect(consultas[0]!.filtros).toContainEqual(["not", "source_metadata->>store_id", "is", null]);
  });

  it("não depende do `source` do contato: um contato cujo source foi reescrito (site, meta_ads) continua achado", async () => {
    const { admin, consultas } = adminDeMentira([{ data: { id: "c-1" }, error: null }]);

    await acharContatoDaLoja(admin, ORG, "4567");

    const mexeNoSource = consultas[0]!.filtros.some(([, coluna]) => coluna === "source");
    expect(mexeNoSource).toBe(false);
  });

  it("cai na chave legada quando o sync não achou ninguém", async () => {
    const { admin, consultas } = adminDeMentira([
      { data: null, error: null },
      { data: { id: "c-legado" }, error: null },
    ]);

    const r = await acharContatoDaLoja(admin, ORG, "4567");

    expect(r.contato).toEqual({ id: "c-legado" });
    expect(consultas).toHaveLength(2);
    expect(consultas[1]!.filtros).toContainEqual(["eq", "organization_id", ORG]);
    expect(consultas[1]!.filtros).toContainEqual(["eq", "source", "nuvemshop"]);
    expect(consultas[1]!.filtros).toContainEqual(["eq", "source_metadata->>nuvemshop_customer_id", "4567"]);
  });

  it("nenhuma chave acha: devolve null sem erro", async () => {
    const { admin } = adminDeMentira([]);
    expect(await acharContatoDaLoja(admin, ORG, "4567")).toEqual({ contato: null, erros: [] });
  });

  it("⭐ busca ambígua (duas lojas com o mesmo id) NÃO escolhe ninguém: sem contato, com o erro anotado, para o chamador cair no e-mail", async () => {
    const { admin } = adminDeMentira([
      { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } },
      { data: null, error: null },
    ]);

    const r = await acharContatoDaLoja(admin, ORG, "4567");

    expect(r.contato).toBeNull();
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toContain("multiple");
  });

  it("erro na 1ª busca não impede a 2ª, e o erro fica anotado", async () => {
    const { admin } = adminDeMentira([
      { data: null, error: { message: "timeout" } },
      { data: { id: "c-legado" }, error: null },
    ]);

    const r = await acharContatoDaLoja(admin, ORG, "4567");

    expect(r.contato).toEqual({ id: "c-legado" });
    expect(r.erros).toEqual(["sync: timeout"]);
  });

  it("id vazio não consulta o banco", async () => {
    const { admin, consultas } = adminDeMentira([]);
    expect(await acharContatoDaLoja(admin, ORG, "  ")).toEqual({ contato: null, erros: [] });
    expect(consultas).toHaveLength(0);
  });
});
