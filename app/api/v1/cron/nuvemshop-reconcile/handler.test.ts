import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  autoriza: vi.fn(() => true),
  audit: vi.fn(),
  iniciar: vi.fn(),
  iniciarCatalogo: vi.fn(),
  convergir: vi.fn(),
  varrer: vi.fn(),
  carimbar: vi.fn(),
}));
vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: m.autoriza }));
vi.mock("@/lib/audit", () => ({ audit: m.audit }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/nuvemshop/sync/deps", () => ({ depsReais: () => ({}) }));
vi.mock("@/lib/nuvemshop/sync/iniciar", () => ({ iniciarSincronizacao: m.iniciar }));
vi.mock("@/lib/nuvemshop/sync/catalogo-deps", () => ({ depsDoCatalogoReais: () => ({}) }));
vi.mock("@/lib/nuvemshop/sync/iniciar-catalogo", () => ({ iniciarCatalogo: m.iniciarCatalogo }));
vi.mock("@/lib/nuvemshop/sync/assinaturas", () => ({ convergirAssinaturasDaLoja: m.convergir }));
vi.mock("@/lib/nuvemshop/sync/assinaturas-deps", () => ({ depsDeAssinaturasReais: () => ({}) }));
vi.mock("@/lib/nuvemshop/sync/carrinhos-abandonados", () => ({
  depsDosCarrinhosReais: () => ({}),
  varrerCarrinhosAbandonados: m.varrer,
}));
vi.mock("@/lib/nuvemshop/sync/origem-dos-pedidos", () => ({
  depsDaOrigemDosPedidosReais: () => ({}),
  carimbarOrigemDosPedidos: m.carimbar,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const rows =
        tabela === "tenant_integrations"
          ? [
              { organization_id: "a", organizations: { status: "active" } },
              { organization_id: "b", organizations: { status: "active" } },
            ]
          : [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.in = async () => ({ data: rows, error: null });
      (q as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null });
      return q;
    },
  }),
}));

const req = () => new NextRequest("http://localhost/api/v1/cron/nuvemshop-reconcile");

describe("GET nuvemshop-reconcile", () => {
  beforeEach(() => {
    m.autoriza.mockReturnValue(true);
    m.audit.mockReset();
    m.iniciar.mockReset();
    m.iniciarCatalogo.mockReset();
    m.iniciarCatalogo.mockResolvedValue({ ok: true });
    m.convergir.mockReset();
    m.convergir.mockResolvedValue({ criadas: 0, falhas: 0 });
    m.varrer.mockReset();
    m.varrer.mockResolvedValue({ gravados: 0, semContato: 0, truncado: false });
    m.carimbar.mockReset();
    m.carimbar.mockResolvedValue({ lidos: 0, carimbados: 0, semOrigem: 0, falhas: 0, truncado: false });
  });

  it("sem secret → 403", async () => {
    m.autoriza.mockReturnValue(false);
    const { GET } = await import("./route");
    expect((await GET(req())).status).toBe(403);
    expect(m.iniciar).not.toHaveBeenCalled();
  });

  it("início ok:false não audita; ok audita exatamente uma vez", async () => {
    m.iniciar
      .mockResolvedValueOnce({ ok: false, motivo: "sync_em_andamento" })
      .mockResolvedValueOnce({ ok: true, runId: "r2" });
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.data).toEqual({ candidatos: 2, iniciados: 1, falhas: 0, assinaturas_criadas: 0, carrinhos_registrados: 0, origens_carimbadas: 0 });
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "nuvemshop.sync_requested", organizationId: "b" }));
  });

  it("exceção na 1ª org não impede a 2ª", async () => {
    m.iniciar.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ ok: true, runId: "r2" });
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.data).toEqual({ candidatos: 2, iniciados: 1, falhas: 1, assinaturas_criadas: 0, carrinhos_registrados: 0, origens_carimbadas: 0 });
    expect(m.audit).toHaveBeenCalledTimes(1);
  });

  it("convergência: audita só quando criou assinatura, e conta no corpo", async () => {
    m.iniciar.mockResolvedValue({ ok: false, motivo: "sync_em_andamento" });
    m.convergir.mockResolvedValueOnce({ criadas: 1, falhas: 0 }).mockResolvedValueOnce({ criadas: 0, falhas: 0 });
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.data.assinaturas_criadas).toBe(1);
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "nuvemshop.assinaturas_convergidas", organizationId: "a" }));
  });

  it("carrinhos abandonados: audita só quando gravou algo", async () => {
    m.iniciar.mockResolvedValue({ ok: false, motivo: "sync_em_andamento" });
    m.varrer
      .mockResolvedValueOnce({ gravados: 0, semContato: 3, truncado: false })
      .mockResolvedValueOnce({ gravados: 4, semContato: 1, truncado: false });
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.data.carrinhos_registrados).toBe(4);
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "nuvemshop.carrinhos_abandonados_registrados", organizationId: "b", metadata: expect.objectContaining({ gravados: 4 }) }),
    );
  });

  it("falha na convergência não impede a varredura de carrinhos nem a loja seguinte", async () => {
    m.iniciar.mockResolvedValue({ ok: false, motivo: "sync_em_andamento" });
    m.convergir.mockRejectedValueOnce(new Error("boom"));
    const { GET } = await import("./route");
    const resposta = await GET(req());
    expect(resposta.status).toBe(200);
    expect(m.varrer).toHaveBeenCalledTimes(2);
    expect(m.convergir).toHaveBeenCalledTimes(2);
  });

  it("falha na varredura de carrinhos não impede a loja seguinte", async () => {
    m.iniciar.mockResolvedValue({ ok: false, motivo: "sync_em_andamento" });
    m.varrer.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ gravados: 2, semContato: 0, truncado: false });
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.data.carrinhos_registrados).toBe(2);
  });

  it("o catálogo também é conferido, continuando do cursor (reconciliacao), e não audita à parte", async () => {
    m.iniciar.mockResolvedValue({ ok: true, runId: "r" });
    const { GET } = await import("./route");
    await GET(req());
    expect(m.iniciarCatalogo).toHaveBeenCalledTimes(2);
    expect(m.iniciarCatalogo).toHaveBeenNthCalledWith(1, expect.anything(), "a", "reconciliacao");
    expect(m.iniciarCatalogo).toHaveBeenNthCalledWith(2, expect.anything(), "b", "reconciliacao");
    expect(m.audit).toHaveBeenCalledTimes(2);
  });

  it("os pedidos não iniciarem (run em andamento) não impede a conferência do catálogo", async () => {
    m.iniciar.mockResolvedValue({ ok: false, motivo: "sync_em_andamento" });
    const { GET } = await import("./route");
    await GET(req());
    expect(m.iniciarCatalogo).toHaveBeenCalledTimes(2);
  });

  it("origem dos pedidos: audita só quando carimbou algo, e conta no corpo", async () => {
    m.iniciar.mockResolvedValue({ ok: false, motivo: "sync_em_andamento" });
    m.carimbar
      .mockResolvedValueOnce({ lidos: 5, carimbados: 0, semOrigem: 5, falhas: 0, truncado: false })
      .mockResolvedValueOnce({ lidos: 40, carimbados: 3, semOrigem: 1, falhas: 2, truncado: true });
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.data.origens_carimbadas).toBe(3);
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "nuvemshop.origem_dos_pedidos_carimbada",
        organizationId: "b",
        metadata: expect.objectContaining({ carimbados: 3, falhas: 2, truncado: true }),
      }),
    );
  });

  it("falha na origem dos pedidos não impede a loja seguinte nem derruba a rodada", async () => {
    m.iniciar.mockResolvedValue({ ok: false, motivo: "sync_em_andamento" });
    m.carimbar
      .mockRejectedValueOnce(new Error("orders_leitura:42703"))
      .mockResolvedValueOnce({ lidos: 2, carimbados: 2, semOrigem: 0, falhas: 0, truncado: false });
    const { GET } = await import("./route");
    const resposta = await GET(req());
    expect(resposta.status).toBe(200);
    expect(m.carimbar).toHaveBeenCalledTimes(2);
    expect((await resposta.json()).data.origens_carimbadas).toBe(2);
  });
});
