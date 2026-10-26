/**
 * O OBJETIVO DO FUNIL no editor de funil (Entrega 1 / workstream B).
 *
 * `crm_pipelines.settings` tem vários donos (campos, motivos, reabertura). O
 * objetivo entra por MERGE: gravar o objetivo não pode apagar os campos do lead,
 * e "Sem objetivo" tira só a chave `objetivo`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "22222222-2222-4222-8222-222222222222";
const PIPE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const deps = vi.hoisted(() => ({
  linha: null as null | Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  user: { id: "u1", support: undefined as unknown } as Record<string, unknown>,
  podeAdministrar: true,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/server", () => ({
  mfaEmDivida: vi.fn(async () => false),
  loadAuthUser: vi.fn(async () => deps.user),
  resolveActiveOrg: vi.fn(async () => ({ orgId: ORG, name: "QA", role: "admin" })),
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({
  podeAdministrarEmpresa: () => deps.podeAdministrar,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: deps.linha, error: null }),
        update: (payload: Record<string, unknown>) => {
          deps.updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
      return b;
    },
  }),
}));

import { updatePipelineConfig } from "./updatePipelineConfig";
import { audit } from "@/lib/audit";

beforeEach(() => {
  vi.clearAllMocks();
  deps.updates = [];
  deps.podeAdministrar = true;
  deps.user = { id: "u1", support: undefined };
  deps.linha = {
    organization_id: ORG,
    vocabulary: { lead: "Paciente" },
    settings: { fields: [{ key: "endereco" }], lost_reasons: ["caro"], reabertura: "novo_negocio" },
  };
});

describe("updatePipelineConfig — objetivo do funil", () => {
  it("grava o objetivo por MERGE, preservando as outras chaves de settings", async () => {
    expect(await updatePipelineConfig(PIPE, { objetivo: "vender_produto" })).toEqual({ ok: true });
    expect(deps.updates).toHaveLength(1);
    expect(deps.updates[0]!.settings).toEqual({
      fields: [{ key: "endereco" }],
      lost_reasons: ["caro"],
      reabertura: "novo_negocio",
      objetivo: "vender_produto",
    });
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pipeline.config_updated",
        organizationId: ORG,
        metadata: expect.objectContaining({ objetivo: "vender_produto" }),
      }),
    );
  });

  it("'Sem objetivo' (null) tira só a chave objetivo", async () => {
    deps.linha = { ...deps.linha!, settings: { fields: [], objetivo: "agendar" } };
    await updatePipelineConfig(PIPE, { objetivo: null });
    expect(deps.updates[0]!.settings).toEqual({ fields: [] });
  });

  it("patch sem objetivo não toca no objetivo que já existe", async () => {
    deps.linha = { ...deps.linha!, settings: { objetivo: "agendar" } };
    await updatePipelineConfig(PIPE, { won_reason_required: true });
    expect(deps.updates[0]!.settings).toEqual({ objetivo: "agendar", won_reason_required: true });
  });

  it("objetivo fora do vocabulário é recusado pelo Zod e nada é gravado", async () => {
    const r = await updatePipelineConfig(PIPE, { objetivo: "vender_tudo" } as never);
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(deps.updates).toHaveLength(0);
  });

  it("funil de outra organização é recusado", async () => {
    deps.linha = { ...deps.linha!, organization_id: "outra" };
    expect(await updatePipelineConfig(PIPE, { objetivo: "agendar" })).toEqual({
      ok: false,
      error: "forbidden_tenant",
    });
    expect(deps.updates).toHaveLength(0);
  });

  it("quem não administra a empresa não grava objetivo", async () => {
    deps.podeAdministrar = false;
    expect(await updatePipelineConfig(PIPE, { objetivo: "agendar" })).toEqual({
      ok: false,
      error: "forbidden_role",
    });
    expect(deps.updates).toHaveLength(0);
  });
});
