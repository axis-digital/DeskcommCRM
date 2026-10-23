import { describe, expect, it, vi } from "vitest";
import { NuvemshopApiError } from "@/lib/nuvemshop/api-client";
import type { DepsDoCatalogo } from "./catalogo-deps";
import { depsDoCatalogo, linhaDeEvento } from "../../../tests/helpers/catalogo-nuvemshop";
import { processarProdutoDoWebhook } from "./produto.handler";

const ev = (tipo: string, payload: Record<string, unknown>) => linhaDeEvento(`nuvemshop.${tipo}`, payload);
const apiCom = (getProduct: ReturnType<typeof vi.fn>) =>
  vi.fn(() => ({ listProducts: vi.fn(), getProduct })) as unknown as DepsDoCatalogo["api"];

describe("nuvemshop-produto.v1", () => {
  it("created/updated: busca o produto na API e grava", async () => {
    const get = vi.fn().mockResolvedValue({ id: 9, name: "x" });
    const d = depsDoCatalogo({ api: apiCom(get) });
    const r = await processarProdutoDoWebhook(ev("product_updated", { store_id: "s1", id: 9 }), d);
    expect(get).toHaveBeenCalledWith("9");
    expect(d.gravarProduto).toHaveBeenCalledWith("org-1", { id: 9, name: "x" });
    expect(r.status).toBe("ok");
  });

  it("product_synced (o nome de hoje) usa product_id e a ação do webhook", async () => {
    const get = vi.fn().mockResolvedValue({ id: 9, name: "x" });
    const d = depsDoCatalogo({ api: apiCom(get) });
    await processarProdutoDoWebhook(ev("product_synced", { id: 9, product_id: "9", acao: "updated" }), d);
    expect(get).toHaveBeenCalledWith("9");
    const apagado = depsDoCatalogo({ api: apiCom(get) });
    await processarProdutoDoWebhook(ev("product_synced", { id: 9, product_id: "9", acao: "deleted" }), apagado);
    expect(apagado.apagarProduto).toHaveBeenCalledWith("org-1", "9");
  });

  it("a carga inicial da conexão não é um produto: fica para a varredura", async () => {
    const d = depsDoCatalogo();
    const r = await processarProdutoDoWebhook(ev("product_synced", { catalogo_inteiro: true, store_id: "s1" }), d);
    expect(r).toMatchObject({ status: "skipped", detail: "catalogo_inteiro" });
    expect(d.carregarIntegracao).not.toHaveBeenCalled();
  });

  it("deleted: apaga do espelho sem ir à API", async () => {
    const get = vi.fn();
    const d = depsDoCatalogo({ api: apiCom(get) });
    const r = await processarProdutoDoWebhook(ev("product_deleted", { store_id: "s1", id: 9 }), d);
    expect(d.apagarProduto).toHaveBeenCalledWith("org-1", "9");
    expect(get).not.toHaveBeenCalled();
    expect(r.status).toBe("ok");
  });

  it("produto que já não existe na API (404) sai do espelho", async () => {
    const get = vi.fn().mockRejectedValue(new NuvemshopApiError(404, "nf", "{}"));
    const d = depsDoCatalogo({ api: apiCom(get) });
    const r = await processarProdutoDoWebhook(ev("product_updated", { id: 9 }), d);
    expect(d.apagarProduto).toHaveBeenCalledWith("org-1", "9");
    expect(r).toMatchObject({ status: "ok", detail: "produto_inexistente" });
  });

  it("produto ruim vira skipped com o motivo", async () => {
    const d = depsDoCatalogo({
      api: apiCom(vi.fn().mockResolvedValue({ id: 9 })),
      gravarProduto: vi.fn().mockResolvedValue({ ok: false, motivo: "produto_sem_nome:9" }),
    });
    expect(await processarProdutoDoWebhook(ev("product_created", { id: 9 }), d)).toMatchObject({
      status: "skipped",
      detail: "produto_sem_nome:9",
    });
  });

  it("registro mais novo já gravado é reportado, não é erro", async () => {
    const d = depsDoCatalogo({
      api: apiCom(vi.fn().mockResolvedValue({ id: 9 })),
      gravarProduto: vi.fn().mockResolvedValue({ ok: true, ignorado: "ja_mais_novo" }),
    });
    expect((await processarProdutoDoWebhook(ev("product_updated", { id: 9 }), d)).detail).toBe("ja_mais_novo");
  });

  it("sem id → skipped; integração inativa → skipped", async () => {
    expect((await processarProdutoDoWebhook(ev("product_updated", {}), depsDoCatalogo())).detail).toBe("sem_id");
    const inativa = depsDoCatalogo({ carregarIntegracao: vi.fn().mockResolvedValue(null) });
    expect((await processarProdutoDoWebhook(ev("product_updated", { id: 9 }), inativa)).detail).toBe("integracao_inativa");
  });

  it("429 reagenda e 401 desautoriza", async () => {
    const lento = depsDoCatalogo({ api: apiCom(vi.fn().mockRejectedValue(new NuvemshopApiError(429, "r", "{}", undefined, 800))) });
    expect(await processarProdutoDoWebhook(ev("product_updated", { id: 9 }), lento)).toMatchObject({ status: "retry" });
    const negado = depsDoCatalogo({ api: apiCom(vi.fn().mockRejectedValue(new NuvemshopApiError(401, "a", "{}"))) });
    await processarProdutoDoWebhook(ev("product_updated", { id: 9 }), negado);
    expect(negado.desautorizar).toHaveBeenCalled();
  });
});
