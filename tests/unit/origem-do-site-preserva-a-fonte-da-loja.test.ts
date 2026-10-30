/**
 * A origem da página, lida do WhatsApp (`[dk1:…]` e `[ref:…]`), não reescreve o `source` de quem
 * já é cliente da loja.
 *
 * A função do banco grava `source = p_platform`. Para o contato que nasce no WhatsApp isso vira
 * 'site', de propósito. Mas o contato que o sync da loja criou tem `source = 'nuvemshop'`, e se o
 * cliente chama no WhatsApp pela primeira vez vindo de uma página com UTM, o carimbo trocava o
 * `source` dele por 'site' — perdendo a marca de que ele é cliente da loja.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { estamparOrigemDaPaginaPreservandoAFonte } from "@/lib/leads/origem-do-site";

const ORIGEM = { utm: { utm_source: "instagram" }, capturadaEm: "2026-10-30T10:00:00.000Z" };

function bancoDeMentira(contato: { data: { source: string | null } | null; error: { message: string } | null }) {
  const rpcs: Array<Record<string, unknown>> = [];
  const filtros: Array<[string, ...unknown[]]> = [];
  const admin = {
    from(tabela: string) {
      filtros.push(["from", tabela]);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) {
        q[m] = (...args: unknown[]) => {
          filtros.push([m, ...args]);
          return q;
        };
      }
      q.maybeSingle = async () => contato;
      return q;
    },
    async rpc(_nome: string, args: Record<string, unknown>) {
      rpcs.push(args);
      return { error: null };
    },
  } as never;
  return { admin, rpcs, filtros };
}

describe("estamparOrigemDaPaginaPreservandoAFonte", () => {
  it("⭐ contato da loja: o source 'nuvemshop' é repassado e o banco não o reescreve para 'site'", async () => {
    const { admin, rpcs } = bancoDeMentira({ data: { source: "nuvemshop" }, error: null });

    const gravou = await estamparOrigemDaPaginaPreservandoAFonte(admin, "org-1", "c-1", ORIGEM);

    expect(gravou).toBe(true);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({ p_platform: "nuvemshop", p_org: "org-1", p_contact: "c-1" });
  });

  it("contato que nasceu no WhatsApp segue como sempre: source vira 'site'", async () => {
    const { admin, rpcs } = bancoDeMentira({ data: { source: "whatsapp" }, error: null });

    await estamparOrigemDaPaginaPreservandoAFonte(admin, "org-1", "c-1", ORIGEM);

    expect(rpcs[0]).toMatchObject({ p_platform: "site" });
  });

  it("lê o contato DA ORGANIZAÇÃO (o admin ignora a RLS)", async () => {
    const { admin, filtros } = bancoDeMentira({ data: { source: "whatsapp" }, error: null });

    await estamparOrigemDaPaginaPreservandoAFonte(admin, "org-1", "c-1", ORIGEM);

    expect(filtros).toContainEqual(["from", "contacts"]);
    expect(filtros).toContainEqual(["eq", "organization_id", "org-1"]);
    expect(filtros).toContainEqual(["eq", "id", "c-1"]);
  });

  it("⭐ na dúvida não grava: falha de leitura devolve false e não chama o banco para estampar", async () => {
    const { admin, rpcs } = bancoDeMentira({ data: null, error: { message: "timeout" } });

    expect(await estamparOrigemDaPaginaPreservandoAFonte(admin, "org-1", "c-1", ORIGEM)).toBe(false);
    expect(rpcs).toHaveLength(0);
  });

  it("contato inexistente na organização: false, sem estampar", async () => {
    const { admin, rpcs } = bancoDeMentira({ data: null, error: null });

    expect(await estamparOrigemDaPaginaPreservandoAFonte(admin, "org-1", "c-1", ORIGEM)).toBe(false);
    expect(rpcs).toHaveLength(0);
  });
});

describe("cerca: a entrada do WhatsApp usa o invólucro e não o carimbo cru", () => {
  const fonte = readFileSync(resolve(__dirname, "../../lib/channels/pos-entrada.ts"), "utf8");

  it("chama estamparOrigemDaPaginaPreservandoAFonte", () => {
    expect(fonte).toMatch(/estamparOrigemDaPaginaPreservandoAFonte\(/);
  });

  it("não volta a chamar estamparOrigemDaPagina( direto (reescreveria o source da loja)", () => {
    expect(fonte).not.toMatch(/[^A-Za-z]estamparOrigemDaPagina\(/);
  });
});
