/**
 * O PERFIL DO NEGÓCIO NASCE NAS BOAS-VINDAS (Entrega 1, workstream A).
 *
 * O passo de boas-vindas passou a perguntar, além de "O que vocês fazem?",
 * POR ONDE o negócio vende (canais, opcional) e O QUE ele quer que a conversa
 * vire (objetivos, ao menos um). O par mora em
 * `organizations.settings.perfil_de_negocio` — e `settings` é jsonb
 * COMPARTILHADO: guarda branding, política de MFA, conversões. Sobrescrevê-lo
 * inteiro apagaria a marca e a segurança da organização sem erro nenhum.
 *
 * ─── O QUE ESTE ARQUIVO MEDE ─────────────────────────────────────────────
 * - `welcomeSchema` exige o perfil, com ao menos um objetivo, e deduplica.
 * - `acceptWelcome` lê os grupos de checkbox (`getAll`) e grava o perfil por
 *   MERGE: as outras chaves de `settings` saem intactas, na MESMA escrita do
 *   passo (com a guarda `onboarded_at is null` do #2113).
 * - Perfil sem objetivo, ou com valor fora do vocabulário: `invalid_input` e
 *   NADA é gravado.
 *
 * Não mede o banco real (o dublê imita o PostgREST); o caminho de tela está
 * em `tests/e2e/vps-fresh-onboarding.spec.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { welcomeSchema } from "@/lib/schemas/onboarding";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";

interface Linha {
  id: string;
  display_name: string;
  settings: Record<string, unknown>;
  onboarding_state: Record<string, unknown>;
  onboarded_at: string | null;
}
interface Consulta {
  table: string;
  op: "select" | "update";
  payload: Record<string, unknown> | null;
  filtros: Record<string, unknown>;
}
interface Resposta {
  data: unknown;
  error: { message: string } | null;
}

let linha: Linha;
let escritas: Record<string, unknown>[] = [];

const mundo = vi.hoisted(() => ({ redirects: [] as string[] }));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    mundo.redirects.push(destino);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    throw new Error("o passo não pode gravar em `organizations` pelo client de sessão");
  },
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({
    id: USER,
    email: "dono@qa.local",
    full_name: "Dona",
    organizations: [
      { organization_id: ORG, organization_name: "Org", role: "admin", org_status: "active" },
    ],
    support: null,
  })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: ORG, name: "Org", role: "admin" })),
}));

import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";

function clienteFalso() {
  const abrir = (table: string) => {
    const c: Consulta = { table, op: "select", payload: null, filtros: {} };
    const resolver = (): Promise<Resposta> => {
      if (c.table !== "organizations") throw new Error(`tabela não dublada: ${c.table}`);
      if (c.op === "select") return Promise.resolve({ data: { ...linha }, error: null });
      const bate = !("is:onboarded_at" in c.filtros) || linha.onboarded_at === null;
      if (c.filtros.id !== ORG || !bate) return Promise.resolve({ data: [], error: null });
      escritas.push(c.payload ?? {});
      linha = { ...linha, ...(c.payload as Partial<Linha>) };
      return Promise.resolve({ data: [{ id: ORG }], error: null });
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
      is: (coluna: string, valor: unknown) => {
        c.filtros[`is:${coluna}`] = valor;
        return b;
      },
      limit: () => b,
      single: () => resolver(),
      maybeSingle: () => resolver(),
      then: (ok: (r: Resposta) => unknown, no?: (e: unknown) => unknown) => resolver().then(ok, no),
    };
    return b;
  };
  return { from: abrir } as never;
}

function formulario(perfil: { canais?: string[]; objetivos?: string[] }): FormData {
  const fd = new FormData();
  fd.set("display_name", "Loja da Ana");
  fd.set("timezone", "America/Sao_Paulo");
  fd.set("organization_id", ORG);
  for (const c of perfil.canais ?? []) fd.append("canais", c);
  for (const o of perfil.objetivos ?? []) fd.append("objetivos", o);
  return fd;
}

async function executar(fd: FormData) {
  try {
    return await acceptWelcome(fd);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") return null;
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  escritas = [];
  mundo.redirects = [];
  linha = {
    id: ORG,
    display_name: "Minha Empresa",
    settings: {
      branding: { nome: "Marca da Ana", accent_hex: "#123456" },
      security: { mfa_required: false },
    },
    onboarding_state: {},
    onboarded_at: null,
  };
});

describe("welcomeSchema: o perfil do negócio", () => {
  const base = { display_name: "Loja da Ana", timezone: "America/Sao_Paulo" };

  it("aceita canais e objetivos válidos, deduplicando", () => {
    const r = welcomeSchema.parse({
      ...base,
      perfil_de_negocio: {
        canais: ["whatsapp", "whatsapp"],
        objetivos: ["vender_produto", "agendar", "agendar"],
      },
    });
    expect(r.perfil_de_negocio).toEqual({
      canais: ["whatsapp"],
      objetivos: ["vender_produto", "agendar"],
    });
  });

  it("canais podem ficar vazios; objetivo não", () => {
    expect(
      welcomeSchema.safeParse({
        ...base,
        perfil_de_negocio: { canais: [], objetivos: ["captar_lead"] },
      }).success,
    ).toBe(true);
    expect(
      welcomeSchema.safeParse({
        ...base,
        perfil_de_negocio: { canais: ["whatsapp"], objetivos: [] },
      }).success,
    ).toBe(false);
  });

  it("sem perfil nenhum é recusado", () => {
    expect(welcomeSchema.safeParse(base).success).toBe(false);
  });

  it("valor fora do vocabulário é recusado", () => {
    expect(
      welcomeSchema.safeParse({
        ...base,
        perfil_de_negocio: { canais: ["telegram"], objetivos: ["vender_produto"] },
      }).success,
    ).toBe(false);
  });
});

describe("acceptWelcome: grava o perfil do negócio por merge", () => {
  it("grava canais e objetivos em settings.perfil_de_negocio e preserva branding e security", async () => {
    await executar(
      formulario({ canais: ["whatsapp", "instagram"], objetivos: ["vender_produto", "agendar"] }),
    );

    expect(mundo.redirects).toEqual(["/onboarding"]);
    expect(escritas).toHaveLength(1);
    expect(linha.settings).toEqual({
      branding: { nome: "Marca da Ana", accent_hex: "#123456" },
      security: { mfa_required: false },
      perfil_de_negocio: {
        canais: ["whatsapp", "instagram"],
        objetivos: ["vender_produto", "agendar"],
      },
    });
    // O mesmo UPDATE do passo: nome e estado gravados junto, não em duas escritas.
    expect(escritas[0]).toMatchObject({ display_name: "Loja da Ana" });
    expect(escritas[0]).toHaveProperty("onboarding_state");
  });

  it("sem objetivo marcado: invalid_input e nada é gravado", async () => {
    const r = await executar(formulario({ canais: ["whatsapp"], objetivos: [] }));

    expect(r).toMatchObject({ ok: false, error: "invalid_input" });
    expect(escritas).toEqual([]);
    expect(mundo.redirects).toEqual([]);
  });

  it("objetivo fora do vocabulário: invalid_input e nada é gravado", async () => {
    const r = await executar(formulario({ objetivos: ["dominar_o_mundo"] }));

    expect(r).toMatchObject({ ok: false, error: "invalid_input" });
    expect(escritas).toEqual([]);
  });

  it("organização já configurada: não grava o perfil (guarda do #2113 vale para settings)", async () => {
    linha = { ...linha, onboarded_at: "2026-01-01T00:00:00.000Z" };

    await executar(formulario({ objetivos: ["captar_lead"] }));

    expect(escritas).toEqual([]);
    expect(linha.settings).not.toHaveProperty("perfil_de_negocio");
    expect(mundo.redirects).toEqual(["/app/inbox"]);
  });
});
