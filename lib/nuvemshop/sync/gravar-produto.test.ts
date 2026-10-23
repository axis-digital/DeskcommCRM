import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apagarProduto, gravarProduto } from "./gravar-produto";

/** Dublê do admin: só o que o espelho do catálogo toca. */
function adminFalso(opts: { existente?: string | null; upsertErro?: string; deleteErro?: string } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: opts.upsertErro ? { message: opts.upsertErro } : null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: opts.existente ? { last_updated_at: opts.existente } : null,
    error: null,
  });
  const eqsDoDelete: Array<[string, unknown]> = [];
  const apagar = {
    eq: (coluna: string, valor: unknown) => {
      eqsDoDelete.push([coluna, valor]);
      return eqsDoDelete.length >= 2
        ? Promise.resolve({ error: opts.deleteErro ? { message: opts.deleteErro } : null })
        : apagar;
    },
  };
  const leitura = { select: () => leitura, eq: () => leitura, maybeSingle };
  const admin = {
    from: vi.fn(() => ({ ...leitura, upsert, delete: () => apagar })),
  } as unknown as SupabaseClient;
  return { admin, upsert, eqsDoDelete };
}

const bruto = {
  id: 9,
  name: { pt: "Sabonete" },
  variants: [{ price: "12.50", stock: 2 }],
  updated_at: "2026-10-20T10:00:00.000Z",
};
const ctx = { orgId: "org-1" };

describe("gravarProduto", () => {
  it("faz upsert pela chave (organização, id externo) e põe a organização no registro", async () => {
    const { admin, upsert } = adminFalso();
    await expect(gravarProduto(admin, ctx, bruto)).resolves.toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1", external_id: "9", title: "Sabonete", price_cents: 1250 }),
      { onConflict: "organization_id,external_id" },
    );
  });

  it("não grava por cima de um registro mais novo (webhook e varredura em paralelo)", async () => {
    const { admin, upsert } = adminFalso({ existente: "2026-10-21T00:00:00.000Z" });
    await expect(gravarProduto(admin, ctx, bruto)).resolves.toEqual({ ok: true, ignorado: "ja_mais_novo" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("grava quando o registro guardado é mais antigo ou igual", async () => {
    const { admin, upsert } = adminFalso({ existente: "2026-10-20T10:00:00.000Z" });
    await gravarProduto(admin, ctx, bruto);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("produto ruim → ok:false com o motivo e o id, sem tocar no banco", async () => {
    const { admin, upsert } = adminFalso();
    await expect(gravarProduto(admin, ctx, { id: 3, name: {}, updated_at: "2026-10-20T10:00:00Z" })).resolves.toEqual({
      ok: false,
      motivo: "produto_sem_nome:3",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("falha de banco LANÇA, para o evento voltar à fila", async () => {
    const { admin } = adminFalso({ upsertErro: "boom" });
    await expect(gravarProduto(admin, ctx, bruto)).rejects.toThrow("nuvemshop_products_upsert:boom");
  });
});

describe("apagarProduto", () => {
  it("apaga filtrando organização E id externo", async () => {
    const { admin, eqsDoDelete } = adminFalso();
    await apagarProduto(admin, ctx, "9");
    expect(eqsDoDelete).toEqual([
      ["organization_id", "org-1"],
      ["external_id", "9"],
    ]);
  });

  it("falha de banco lança", async () => {
    const { admin } = adminFalso({ deleteErro: "x" });
    await expect(apagarProduto(admin, ctx, "9")).rejects.toThrow("nuvemshop_products_delete:x");
  });
});
