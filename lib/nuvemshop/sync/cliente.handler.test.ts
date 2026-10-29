import { describe, expect, it, vi } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { NuvemshopApiError } from "@/lib/nuvemshop/api-client";
import { processarClienteDoWebhook } from "./cliente.handler";
import type { DepsDosEventosDoSite } from "./eventos-do-site.service";

const INTEG = {
  id: "integ-1",
  organizationId: "org-1",
  status: "healthy",
  storeId: "s1",
  accessToken: "t",
};

const row = (payload: Record<string, unknown>): EventRow => ({
  id: "ev",
  organization_id: "org-1",
  event_type: "nuvemshop.customer_created",
  entity_kind: "nuvemshop_webhook",
  entity_id: null,
  payload,
  metadata: {},
  consumed_by: [],
  attempts: 0,
});

const CLIENTE = {
  id: 288418604,
  name: "Maria Silva",
  email: "maria@exemplo.com",
  phone: "+5511987654321",
  identification: "52998224725",
  created_at: "2026-10-06T14:33:12+0000",
};

function deps(
  getCustomer: ReturnType<typeof vi.fn>,
  over: Partial<DepsDosEventosDoSite> = {},
): DepsDosEventosDoSite {
  return {
    carregarIntegracao: vi.fn().mockResolvedValue(INTEG),
    api: vi.fn(() => ({
      getCustomer,
      listAbandonedCheckouts: vi.fn(),
    })) as unknown as DepsDosEventosDoSite["api"],
    resolverContato: vi.fn().mockResolvedValue("contato-1"),
    gravarEvento: vi.fn().mockResolvedValue("evento-1"),
    desautorizar: vi.fn(),
    agora: () => new Date("2026-10-29T12:00:00Z"),
    ...over,
  };
}

describe("nuvemshop-cliente.v1", () => {
  it("busca o cliente na API e grava o cadastro ligado ao contato", async () => {
    const d = deps(vi.fn().mockResolvedValue(CLIENTE));

    const r = await processarClienteDoWebhook(row({ store_id: "s1", id: 288418604 }), d);

    expect(r).toMatchObject({ status: "ok", detail: "gravado" });
    expect(d.gravarEvento).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        kind: "cadastro",
        dedupe_key: "cadastro:288418604",
        source: "nuvemshop",
      }),
      "contato-1",
    );
  });

  it("resolve o contato pelas chaves do cliente (e-mail, telefone, CPF), com o id da loja", async () => {
    const d = deps(vi.fn().mockResolvedValue(CLIENTE));

    await processarClienteDoWebhook(row({ id: 288418604 }), d);

    expect(d.resolverContato).toHaveBeenCalledWith(
      { orgId: "org-1", storeId: "s1", customerId: "288418604" },
      expect.objectContaining({
        email: "maria@exemplo.com",
        telefone: "+5511987654321",
        cpf: "52998224725",
      }),
    );
  });

  it("sem id no aviso → skipped, sem tocar na API", async () => {
    const getCustomer = vi.fn();
    const r = await processarClienteDoWebhook(row({ store_id: "s1" }), deps(getCustomer));
    expect(r).toMatchObject({ status: "skipped", detail: "sem_id" });
    expect(getCustomer).not.toHaveBeenCalled();
  });

  it("integração inativa → skipped sem chamar a API", async () => {
    const getCustomer = vi.fn();
    const d = deps(getCustomer, {
      carregarIntegracao: vi.fn().mockResolvedValue({ ...INTEG, status: "disconnected" }),
    });
    expect(await processarClienteDoWebhook(row({ id: 1 }), d)).toMatchObject({
      status: "skipped",
      detail: "integracao_inativa",
    });
    expect(getCustomer).not.toHaveBeenCalled();
  });

  it("cliente apagado na loja (404) → skipped", async () => {
    const d = deps(vi.fn().mockRejectedValue(new NuvemshopApiError(404, "not_found", "")));
    expect(await processarClienteDoWebhook(row({ id: 1 }), d)).toMatchObject({
      status: "skipped",
      detail: "cliente_inexistente",
    });
    expect(d.gravarEvento).not.toHaveBeenCalled();
  });

  it("cliente sem nenhuma chave de contato → skipped, e NADA é gravado (não se inventa alguém)", async () => {
    const d = deps(vi.fn().mockResolvedValue({ id: 5, created_at: "2026-10-06T14:33:12+0000" }), {
      resolverContato: vi.fn().mockResolvedValue(null),
    });
    expect(await processarClienteDoWebhook(row({ id: 5 }), d)).toMatchObject({
      status: "skipped",
      detail: "sem_contato",
    });
    expect(d.gravarEvento).not.toHaveBeenCalled();
  });

  it("resposta da API sem id → skipped (não há fato a registrar)", async () => {
    const d = deps(vi.fn().mockResolvedValue({ name: "sem id" }));
    expect(await processarClienteDoWebhook(row({ id: 5 }), d)).toMatchObject({
      status: "skipped",
      detail: "sem_fato",
    });
    expect(d.gravarEvento).not.toHaveBeenCalled();
  });

  it("limite de taxa (429) → retry, sem gravar", async () => {
    const d = deps(
      vi.fn().mockRejectedValue(new NuvemshopApiError(429, "rate_limited", "", undefined, 5_000)),
    );
    const r = await processarClienteDoWebhook(row({ id: 1 }), d);
    expect(r.status).toBe("retry");
    expect(r.retry_at).toBe("2026-10-29T12:00:05.000Z");
  });

  it("acesso revogado (401) → desautoriza a integração e pula", async () => {
    const d = deps(vi.fn().mockRejectedValue(new NuvemshopApiError(401, "unauthorized", "")));
    expect(await processarClienteDoWebhook(row({ id: 1 }), d)).toMatchObject({
      status: "skipped",
      detail: "desautorizada",
    });
    expect(d.desautorizar).toHaveBeenCalledWith(INTEG);
  });
});
