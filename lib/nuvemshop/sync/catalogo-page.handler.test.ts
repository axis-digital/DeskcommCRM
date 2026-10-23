import { describe, expect, it, vi } from "vitest";
import { NuvemshopApiError } from "@/lib/nuvemshop/api-client";
import { EVENTO_CATALOG_PAGE, PAGINA_MAXIMA_DE_PRODUTOS, PRODUTOS_POR_PAGINA } from "./constantes";
import { processarPaginaDoCatalogo } from "./catalogo-page.handler";
import { depsDoCatalogo, linhaDeEvento } from "../../../tests/helpers/catalogo-nuvemshop";
import type { DepsDoCatalogo } from "./catalogo-deps";

const ev = (p: Record<string, unknown>) => linhaDeEvento(EVENTO_CATALOG_PAGE, p);
const apiCom = (listProducts: ReturnType<typeof vi.fn>) =>
  vi.fn(() => ({ listProducts, getProduct: vi.fn() })) as unknown as DepsDoCatalogo["api"];
const lote = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe("nuvemshop-catalogo.v1", () => {
  it("lista a página pedida, com o cursor, e grava cada produto", async () => {
    const list = vi.fn().mockResolvedValue(lote(3));
    const d = depsDoCatalogo({ api: apiCom(list) });
    const r = await processarPaginaDoCatalogo(ev({ pagina: 1, desde: "2026-10-22T00:00:00.000Z" }), d);
    expect(list).toHaveBeenCalledWith({ page: 1, perPage: PRODUTOS_POR_PAGINA, updatedAtMin: "2026-10-22T00:00:00.000Z" });
    expect(d.gravarProduto).toHaveBeenCalledTimes(3);
    expect(r.status).toBe("ok");
  });

  it("página cheia → pede a próxima, carregando a soma", async () => {
    const d = depsDoCatalogo({ api: apiCom(vi.fn().mockResolvedValue(lote(PRODUTOS_POR_PAGINA))) });
    await processarPaginaDoCatalogo(ev({ pagina: 2, desde: null, gravados: 200, comErro: 1 }), d);
    expect(d.emitirPagina).toHaveBeenCalledWith("org-1", "integ-1", { pagina: 3, desde: null, gravados: 400, comErro: 1 });
    expect(d.auditar).not.toHaveBeenCalled();
  });

  it("página não cheia → fim: audita o total, sem pedir mais", async () => {
    const d = depsDoCatalogo({ api: apiCom(vi.fn().mockResolvedValue(lote(5))) });
    const r = await processarPaginaDoCatalogo(ev({ pagina: 2, desde: null, gravados: 200 }), d);
    expect(d.emitirPagina).not.toHaveBeenCalled();
    expect(d.auditar).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "nuvemshop.catalog_synced",
        organizationId: "org-1",
        metadata: expect.objectContaining({ produtos_gravados: 205, produtos_com_erro: 0 }),
      }),
    );
    expect(r.detail).toBe("catalogo_concluido");
  });

  it("varredura que não gravou nada não audita (rodada vazia não é mutação)", async () => {
    const d = depsDoCatalogo();
    await processarPaginaDoCatalogo(ev({ pagina: 1, desde: "2026-10-22T00:00:00.000Z" }), d);
    expect(d.auditar).not.toHaveBeenCalled();
  });

  it("produto ruim conta como erro e a página segue", async () => {
    const gravar = vi.fn().mockResolvedValueOnce({ ok: false, motivo: "produto_sem_nome:1" }).mockResolvedValue({ ok: true });
    const d = depsDoCatalogo({ api: apiCom(vi.fn().mockResolvedValue(lote(3))), gravarProduto: gravar });
    await processarPaginaDoCatalogo(ev({ pagina: 1, desde: null }), d);
    expect(d.auditar).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ produtos_gravados: 2, produtos_com_erro: 1 }) }));
  });

  it("no teto de páginas da API para e audita que ficou incompleto", async () => {
    const d = depsDoCatalogo({ api: apiCom(vi.fn().mockResolvedValue(lote(PRODUTOS_POR_PAGINA))) });
    const r = await processarPaginaDoCatalogo(ev({ pagina: PAGINA_MAXIMA_DE_PRODUTOS, desde: null }), d);
    expect(d.emitirPagina).not.toHaveBeenCalled();
    expect(d.auditar).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ truncado: true }) }));
    expect(r.detail).toBe("catalogo_truncado");
  });

  it("429 reagenda sem perder a página", async () => {
    const list = vi.fn().mockRejectedValue(new NuvemshopApiError(429, "rate", "x", undefined, 1500));
    const r = await processarPaginaDoCatalogo(ev({ pagina: 1, desde: null }), depsDoCatalogo({ api: apiCom(list) }));
    expect(r).toMatchObject({ status: "retry", detail: "rate_limited" });
  });

  it("401 marca a integração como desautorizada e pula", async () => {
    const list = vi.fn().mockRejectedValue(new NuvemshopApiError(401, "no", "x"));
    const d = depsDoCatalogo({ api: apiCom(list) });
    const r = await processarPaginaDoCatalogo(ev({ pagina: 1, desde: null }), d);
    expect(d.desautorizar).toHaveBeenCalled();
    expect(r).toMatchObject({ status: "skipped", detail: "desautorizada" });
  });

  it("integração inativa ou payload inválido → skipped", async () => {
    const inativa = depsDoCatalogo({ carregarIntegracao: vi.fn().mockResolvedValue({ ...({} as object), id: "i", organizationId: "org-1", status: "unhealthy", storeId: "s", accessToken: "t" }) });
    expect((await processarPaginaDoCatalogo(ev({ pagina: 1, desde: null }), inativa)).detail).toBe("integracao_inativa");
    expect((await processarPaginaDoCatalogo(ev({ pagina: 0 }), depsDoCatalogo())).detail).toBe("payload_invalido");
  });
});
