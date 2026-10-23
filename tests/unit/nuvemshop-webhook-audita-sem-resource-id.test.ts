// @vitest-environment node
/**
 * `api_audit_log.resource_id` é `uuid`. O webhook da Nuvemshop gravava ali o
 * `externalId` (`evento:loja:id`), o insert falhava e a trilha
 * `nuvemshop.webhook_received` ficava sempre vazia, em silêncio (a auditoria é
 * fire-and-forget). O id da entrega vai em `metadata`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const audit = vi.hoisted(() => vi.fn());
const emitidos = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("@/lib/nuvemshop/oauth", () => ({ verifyHmac: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    /** Cadeia select/eq/maybeSingle que devolve `linha`; insert sempre grava. */
    const tabela = (linha: unknown) => {
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        insert: () => Promise.resolve({ error: null }),
        maybeSingle: () => Promise.resolve({ data: linha, error: null }),
      };
      return cadeia;
    };
    return {
      from: (nome: string) =>
        nome === "webhook_events_log"
          ? tabela(null)
          : tabela({ id: "integ-1", organization_id: "org-1", webhook_secret_encrypted: "x" }),
      rpc: (nome: string, args: Record<string, unknown>) => {
        if (nome === "emit_event") emitidos.push(args);
        return Promise.resolve({ data: nome === "fn_decrypt_oauth" ? "segredo" : null, error: null });
      },
    };
  },
}));

import { POST } from "@/app/api/v1/webhooks/nuvemshop/[event]/route";

const chamar = (slug: string, corpo: Record<string, unknown>) =>
  POST(
    new NextRequest(`http://localhost/api/v1/webhooks/nuvemshop/${slug}`, {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "x-linkedstore-hmac-sha256": "assinatura" },
    }),
    { params: Promise.resolve({ event: slug }) },
  );

beforeEach(() => {
  audit.mockReset();
  emitidos.length = 0;
});

describe("webhook da Nuvemshop: trilha de auditoria", () => {
  it("audita sem resourceId (a coluna é uuid) e leva o id da entrega em metadata", async () => {
    const r = await chamar("order-created", { store_id: 5807037, event: "order/created", id: 1234 });
    expect(r.status).toBe(200);
    expect(audit).toHaveBeenCalledExactlyOnceWith({
      action: "nuvemshop.webhook_received",
      organizationId: "org-1",
      resourceType: "nuvemshop_webhook",
      resourceId: null,
      metadata: { event: "order/created", store_id: "5807037", external_id: "order/created:5807037:1234" },
    });
  });

  it("o evento de produto sai como product_synced com product_id e ação", async () => {
    await chamar("product-updated", { store_id: 5807037, event: "product/updated", id: 77 });
    expect(emitidos[0]).toMatchObject({
      p_event_type: "nuvemshop.product_synced",
      p_payload: expect.objectContaining({ product_id: "77", acao: "updated" }),
    });
  });
});
