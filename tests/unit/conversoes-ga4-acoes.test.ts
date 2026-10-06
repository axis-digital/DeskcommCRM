import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({ id: "u1", support: null })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "org-1" })),
  mfaEmDivida: vi.fn(async () => false),
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({ podeAdministrarEmpresa: () => true }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: () => null }));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async () => "\\xcifrado"),
  decryptWebhookSecret: vi.fn(async () => "segredo"),
}));
const upserts: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (v: Record<string, unknown>) => {
        upserts.push(v);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

import { updateGa4Connection } from "@/app/actions/settings/updateGa4Connection";
import { salvarRegrasDeConversaoGa4 } from "@/app/actions/settings/salvarRegrasDeConversaoGa4";
import { audit } from "@/lib/audit";

beforeEach(() => {
  upserts.length = 0;
  vi.mocked(audit).mockClear();
});

describe("updateGa4Connection", () => {
  it("recusa Measurement ID fora do formato", async () => {
    const r = await updateGa4Connection({
      measurement_id: "UA-123",
      won_event: "close_convert_lead",
      enabled: true,
    });
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
  });

  it("grava platform ga4 com o secret cifrado e audita sem o segredo", async () => {
    const r = await updateGa4Connection({
      measurement_id: "g-abc123",
      api_secret: "  segredo-real-123  ",
      won_event: "purchase",
      enabled: true,
    });
    expect(r).toEqual({ ok: true });
    expect(upserts[0]).toMatchObject({
      organization_id: "org-1",
      platform: "ga4",
      dataset_id: "G-ABC123",
      ga4_won_event: "purchase",
      access_token_encrypted: "\\xcifrado",
      enabled: true,
    });
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain("segredo-real-123");
  });

  it.each(["close_convert_lead", "purchase"] as const)(
    "evento do ganho %s é aceito, gravado na coluna e auditado",
    async (evento) => {
      const r = await updateGa4Connection({
        measurement_id: "G-ABC123",
        won_event: evento,
        enabled: true,
      });
      expect(r).toEqual({ ok: true });
      expect(upserts[0]).toMatchObject({ ga4_won_event: evento });
      expect(vi.mocked(audit)).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ad_platform_connection.updated",
          organizationId: "org-1",
          metadata: expect.objectContaining({ platform: "ga4", won_event: evento }),
        }),
      );
    },
  );

  it.each(["generate_lead", "Purchase", "", "page_view"])(
    "evento do ganho fora do vocabulário (%j) é recusado sem gravar nem auditar",
    async (evento) => {
      const r = await updateGa4Connection({
        measurement_id: "G-ABC123",
        won_event: evento as never,
        enabled: true,
      });
      expect(r).toMatchObject({ ok: false, error: "validation_failed" });
      expect(upserts).toHaveLength(0);
      expect(vi.mocked(audit)).not.toHaveBeenCalled();
    },
  );

  it("sem api_secret mantém o secret gravado (não zera a coluna)", async () => {
    await updateGa4Connection({
      measurement_id: "G-ABC123",
      won_event: "close_convert_lead",
      enabled: false,
    });
    expect(upserts[0]).not.toHaveProperty("access_token_encrypted");
  });
});

describe("salvarRegrasDeConversaoGa4", () => {
  it("recusa evento que não é de etapa (page_view)", async () => {
    const r = await salvarRegrasDeConversaoGa4([
      {
        stage_id: "11111111-1111-4111-8111-111111111111",
        enabled: true,
        ga4_event: "page_view" as never,
      },
    ]);
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
  });
});
