import { describe, expect, it, vi } from "vitest";
import { depsDoCatalogo } from "../../../tests/helpers/catalogo-nuvemshop";
import { iniciarCatalogo } from "./iniciar-catalogo";

describe("iniciarCatalogo", () => {
  it("conexão e botão pedem a loja inteira (sem cursor)", async () => {
    for (const origem of ["conexao", "manual"] as const) {
      const d = depsDoCatalogo({ cursorDoCatalogo: vi.fn().mockResolvedValue("2026-10-20T10:00:00.000Z") });
      await expect(iniciarCatalogo(d, "org-1", origem)).resolves.toEqual({ ok: true });
      expect(d.emitirPagina).toHaveBeenCalledWith("org-1", "integ-1", { pagina: 1, desde: null, gravados: 0, comErro: 0 });
    }
  });

  it("a reconciliação continua do produto mais novo já espelhado, com 1 min de folga", async () => {
    const d = depsDoCatalogo({ cursorDoCatalogo: vi.fn().mockResolvedValue("2026-10-20T10:00:00.000Z") });
    await iniciarCatalogo(d, "org-1", "reconciliacao");
    expect(d.emitirPagina).toHaveBeenCalledWith("org-1", "integ-1", expect.objectContaining({ desde: "2026-10-20T09:59:00.000Z" }));
  });

  it("a reconciliação com espelho vazio pede a loja inteira", async () => {
    const d = depsDoCatalogo();
    await iniciarCatalogo(d, "org-1", "reconciliacao");
    expect(d.emitirPagina).toHaveBeenCalledWith("org-1", "integ-1", expect.objectContaining({ desde: null }));
  });

  it("já há varredura na fila → não duplica", async () => {
    const d = depsDoCatalogo({ catalogoEmAndamento: vi.fn().mockResolvedValue(true) });
    await expect(iniciarCatalogo(d, "org-1", "manual")).resolves.toEqual({ ok: false, motivo: "sync_em_andamento" });
    expect(d.emitirPagina).not.toHaveBeenCalled();
  });

  it("sem integração, ou desconectada → nao_conectada", async () => {
    for (const integ of [null, { id: "i", organizationId: "org-1", status: "disconnected", storeId: "s", accessToken: "t" }]) {
      const d = depsDoCatalogo({ carregarIntegracao: vi.fn().mockResolvedValue(integ) });
      await expect(iniciarCatalogo(d, "org-1", "manual")).resolves.toEqual({ ok: false, motivo: "nao_conectada" });
    }
  });

  it("integração não saudável só aceita a conexão (que a restaura)", async () => {
    const quebrada = { id: "i", organizationId: "org-1", status: "unhealthy", storeId: "s", accessToken: "t" };
    const d = depsDoCatalogo({ carregarIntegracao: vi.fn().mockResolvedValue(quebrada) });
    await expect(iniciarCatalogo(d, "org-1", "reconciliacao")).resolves.toEqual({ ok: false, motivo: "desautorizada" });
    await expect(iniciarCatalogo(d, "org-1", "conexao")).resolves.toEqual({ ok: true });
  });

  it("falha ao enfileirar devolve falha_ao_iniciar, sem lançar", async () => {
    const d = depsDoCatalogo({ emitirPagina: vi.fn().mockRejectedValue(new Error("db")) });
    await expect(iniciarCatalogo(d, "org-1", "manual")).resolves.toEqual({ ok: false, motivo: "falha_ao_iniciar" });
  });
});
