import { describe, expect, it, vi } from "vitest";

import { NuvemshopApiError } from "@/lib/nuvemshop/api-client";
import {
  PAGINAS_MAXIMAS,
  POR_PAGINA,
  varrerCarrinhosAbandonados,
  type DepsDosCarrinhos,
} from "./carrinhos-abandonados";

const INTEG = { id: "i1", organizationId: "org-1", status: "healthy", storeId: "s1", accessToken: "t" };

const carrinho = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  contact_email: `c${id}@exemplo.com`,
  total: "100.00",
  currency: "BRL",
  created_at: "2026-10-12T19:08:06+0000",
  updated_at: "2026-10-13T21:04:00+0000",
  completed_at: null,
  products: [{ quantity: 1 }],
  ...over,
});

function deps(paginas: unknown[][], over: Partial<DepsDosCarrinhos> = {}): DepsDosCarrinhos & { listar: ReturnType<typeof vi.fn> } {
  const listar = vi.fn(async ({ page }: { page: number }) => paginas[page - 1] ?? []);
  return {
    carregarIntegracao: vi.fn().mockResolvedValue(INTEG),
    api: vi.fn(() => ({ getCustomer: vi.fn(), listAbandonedCheckouts: listar })) as unknown as DepsDosCarrinhos["api"],
    resolverContato: vi.fn().mockResolvedValue("contato-1"),
    gravarEvento: vi.fn().mockResolvedValue("ev"),
    chavesJaGravadas: vi.fn().mockResolvedValue(new Set<string>()),
    desautorizar: vi.fn(),
    agora: () => new Date("2026-10-29T12:00:00Z"),
    listar,
    ...over,
  } as never;
}

describe("varrerCarrinhosAbandonados", () => {
  it("grava cada carrinho abandonado ligado ao contato", async () => {
    const d = deps([[carrinho(1), carrinho(2)]]);

    const r = await varrerCarrinhosAbandonados(d, "org-1");

    expect(r).toMatchObject({ lidos: 2, gravados: 2, paginas: 1, truncado: false });
    expect(d.gravarEvento).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ kind: "carrinho_abandonado", dedupe_key: "carrinho_abandonado:1" }),
      "contato-1",
    );
  });

  it("não regrava o que já está gravado", async () => {
    const d = deps([[carrinho(1), carrinho(2)]], {
      chavesJaGravadas: vi.fn().mockResolvedValue(new Set(["carrinho_abandonado:1"])),
    });
    const r = await varrerCarrinhosAbandonados(d, "org-1");
    expect(r).toMatchObject({ gravados: 1, jaGravados: 1 });
    expect(d.gravarEvento).toHaveBeenCalledTimes(1);
  });

  it("carrinho que virou pedido não é abandono", async () => {
    const d = deps([[carrinho(1, { completed_at: "2026-10-13T22:00:00+0000" }), carrinho(2)]]);
    const r = await varrerCarrinhosAbandonados(d, "org-1");
    expect(r).toMatchObject({ gravados: 1, ignorados: 1 });
  });

  it("carrinho sem como identificar a pessoa não grava nada", async () => {
    const d = deps([[carrinho(1)]], { resolverContato: vi.fn().mockResolvedValue(null) });
    const r = await varrerCarrinhosAbandonados(d, "org-1");
    expect(r).toMatchObject({ gravados: 0, semContato: 1 });
    expect(d.gravarEvento).not.toHaveBeenCalled();
  });

  it("pagina até a primeira página incompleta", async () => {
    const cheia = Array.from({ length: POR_PAGINA }, (_, i) => carrinho(i + 1));
    const d = deps([cheia, [carrinho(9999)]]);
    const r = await varrerCarrinhosAbandonados(d, "org-1");
    expect(r.paginas).toBe(2);
    expect(r.lidos).toBe(POR_PAGINA + 1);
    expect(r.truncado).toBe(false);
  });

  it("respeita o teto de páginas e avisa que cortou", async () => {
    const cheia = (n: number) => Array.from({ length: POR_PAGINA }, (_, i) => carrinho(n * 1000 + i + 1));
    const d = deps(Array.from({ length: PAGINAS_MAXIMAS + 2 }, (_, n) => cheia(n)));
    const r = await varrerCarrinhosAbandonados(d, "org-1");
    expect(r.paginas).toBe(PAGINAS_MAXIMAS);
    expect(r.truncado).toBe(true);
  });

  it("integração inativa → não chama a API", async () => {
    const d = deps([[carrinho(1)]], { carregarIntegracao: vi.fn().mockResolvedValue({ ...INTEG, status: "disconnected" }) });
    const r = await varrerCarrinhosAbandonados(d, "org-1");
    expect(r.motivo).toBe("integracao_inativa");
    expect(d.listar).not.toHaveBeenCalled();
  });

  it("acesso revogado (401) → desautoriza e para", async () => {
    const d = deps([], {});
    d.listar.mockRejectedValue(new NuvemshopApiError(401, "unauthorized", ""));
    const r = await varrerCarrinhosAbandonados(d, "org-1");
    expect(r.motivo).toBe("desautorizada");
    expect(d.desautorizar).toHaveBeenCalledWith(INTEG);
  });

  it("limite de taxa (429) → devolve o que já gravou, sem lançar erro", async () => {
    const cheia = Array.from({ length: POR_PAGINA }, (_, i) => carrinho(i + 1));
    const d = deps([cheia]);
    d.listar.mockResolvedValueOnce(cheia).mockRejectedValueOnce(new NuvemshopApiError(429, "rate_limited", ""));
    const r = await varrerCarrinhosAbandonados(d, "org-1");
    expect(r.motivo).toBe("limite_de_taxa");
    expect(r.gravados).toBe(POR_PAGINA);
  });

  it("erro de outro tipo sobe (o cron registra e segue para a próxima loja)", async () => {
    const d = deps([]);
    d.listar.mockRejectedValue(new Error("rede caiu"));
    await expect(varrerCarrinhosAbandonados(d, "org-1")).rejects.toThrow("rede caiu");
  });
});
