/**
 * CONFIGURAÇÕES › ORGANIZAÇÃO › PERFIL DO NEGÓCIO (Entrega 1, workstream A).
 *
 * `updatePerfilDeNegocio` edita depois o que as boas-vindas perguntaram.
 * Contrato medido aqui:
 * - Zod: ao menos um objetivo, vocabulário fechado; inválido não grava.
 * - RBAC: só quem administra a empresa (`podeAdministrarEmpresa`); agente e
 *   gerente são recusados sem efeito.
 * - Acompanhamento somente-leitura é recusado antes do efeito.
 * - A organização vem da SESSÃO, nunca do corpo.
 * - MERGE em `settings`: branding e security sobrevivem.
 * - Audit `organization.business_profile_updated` com o perfil gravado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";

interface Consulta {
  table: string;
  op: "select" | "update";
  payload: Record<string, unknown> | null;
  filtros: Record<string, unknown>;
}

const mundo = vi.hoisted(() => ({
  role: "admin" as string,
  support: null as unknown,
  user: true,
  settings: {} as Record<string, unknown>,
  updates: [] as Array<{ id: unknown; payload: Record<string, unknown> }>,
  audits: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-request-id": "req-1" }) }));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async (entry: Record<string, unknown>) => {
    mundo.audits.push(entry);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    throw new Error(
      "a escrita em `organizations` vai pelo admin client (policy orgs_write_platform_admin)",
    );
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const c: Consulta = { table, op: "select", payload: null, filtros: {} };
      const resolver = () => {
        if (c.table !== "organizations") throw new Error(`tabela não dublada: ${c.table}`);
        if (c.op === "select") {
          return Promise.resolve({
            data: c.filtros.id === ORG ? { settings: mundo.settings } : null,
            error: null,
          });
        }
        mundo.updates.push({ id: c.filtros.id, payload: c.payload ?? {} });
        if (c.filtros.id === ORG)
          mundo.settings = (c.payload?.settings ?? mundo.settings) as Record<string, unknown>;
        return Promise.resolve({ data: null, error: null });
      };
      const b = {
        select: () => b,
        update: (payload: Record<string, unknown>) => {
          c.op = "update";
          c.payload = payload;
          return b;
        },
        eq: (coluna: string, valor: unknown) => {
          c.filtros[coluna] = valor;
          return b;
        },
        maybeSingle: () => resolver(),
        single: () => resolver(),
        then: (ok: (r: unknown) => unknown, no?: (e: unknown) => unknown) =>
          resolver().then(ok, no),
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/auth/server", () => ({
  mfaEmDivida: vi.fn(async () => false),
  loadAuthUser: vi.fn(async () =>
    mundo.user
      ? {
          id: USER,
          is_platform_admin: false,
          platform_admin_scope: null,
          support: mundo.support,
          organizations: [],
        }
      : null,
  ),
  resolveActiveOrg: vi.fn(async () => ({ orgId: ORG, name: "Org", role: mundo.role })),
}));

import { updatePerfilDeNegocio } from "@/app/actions/settings/updatePerfilDeNegocio";

beforeEach(() => {
  vi.clearAllMocks();
  mundo.role = "admin";
  mundo.support = null;
  mundo.user = true;
  mundo.updates = [];
  mundo.audits = [];
  mundo.settings = {
    branding: { nome: "Marca", accent_hex: "#123456" },
    security: { mfa_required: true },
    perfil_de_negocio: { canais: ["loja_online"], objetivos: ["vender_produto"] },
  };
});

describe("updatePerfilDeNegocio", () => {
  it("admin grava o perfil por merge: branding e security intactos", async () => {
    const r = await updatePerfilDeNegocio({
      canais: ["whatsapp", "telefone"],
      objetivos: ["agendar", "captar_lead"],
    });

    expect(r).toEqual({ ok: true });
    expect(mundo.updates).toHaveLength(1);
    expect(mundo.updates[0]?.id).toBe(ORG);
    expect(mundo.settings).toEqual({
      branding: { nome: "Marca", accent_hex: "#123456" },
      security: { mfa_required: true },
      perfil_de_negocio: {
        canais: ["whatsapp", "telefone"],
        objetivos: ["agendar", "captar_lead"],
      },
    });
  });

  it("audita organization.business_profile_updated com o perfil novo", async () => {
    await updatePerfilDeNegocio({ canais: [], objetivos: ["vender_servico"] });

    expect(mundo.audits).toHaveLength(1);
    expect(mundo.audits[0]).toMatchObject({
      action: "organization.business_profile_updated",
      actorUserId: USER,
      organizationId: ORG,
      resourceType: "organization",
      resourceId: ORG,
      metadata: { canais: [], objetivos: ["vender_servico"] },
    });
  });

  it("sem objetivo: validation_failed, nada gravado nem auditado", async () => {
    const r = await updatePerfilDeNegocio({ canais: ["whatsapp"], objetivos: [] });

    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(mundo.updates).toEqual([]);
    expect(mundo.audits).toEqual([]);
  });

  it("valor fora do vocabulário: validation_failed", async () => {
    const r = await updatePerfilDeNegocio({ canais: ["fax"], objetivos: ["agendar"] } as never);

    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(mundo.updates).toEqual([]);
  });

  it.each(["agent", "manager", "viewer"])("papel %s é recusado sem efeito", async (role) => {
    mundo.role = role;

    const r = await updatePerfilDeNegocio({ canais: [], objetivos: ["agendar"] });

    expect(r).toEqual({ ok: false, error: "forbidden_role" });
    expect(mundo.updates).toEqual([]);
    expect(mundo.audits).toEqual([]);
  });

  it("acompanhamento somente-leitura é recusado antes do efeito", async () => {
    mundo.support = { organization_id: ORG, status: "active", access_mode: "support_readonly" };

    const r = await updatePerfilDeNegocio({ canais: [], objetivos: ["agendar"] });

    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(mundo.updates).toEqual([]);
  });

  it("sem sessão: unauthenticated", async () => {
    mundo.user = false;

    const r = await updatePerfilDeNegocio({ canais: [], objetivos: ["agendar"] });

    expect(r).toEqual({ ok: false, error: "unauthenticated" });
    expect(mundo.updates).toEqual([]);
  });

  it("organization_id no corpo é ignorado: grava na org da sessão", async () => {
    await updatePerfilDeNegocio({
      canais: [],
      objetivos: ["agendar"],
      organization_id: OUTRA,
    } as never);

    expect(mundo.updates.map((u) => u.id)).toEqual([ORG]);
    expect(mundo.settings).toMatchObject({
      perfil_de_negocio: { canais: [], objetivos: ["agendar"] },
    });
  });
});
