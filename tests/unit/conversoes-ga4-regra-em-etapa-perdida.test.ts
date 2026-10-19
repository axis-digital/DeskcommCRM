/**
 * O editor de regras do GA4 aceita a etapa PERDIDA (`close_unconvert_lead`).
 *
 * O painel "Regras sugeridas" cria regra na etapa perdida. Se o editor seguisse
 * recusando a perdida — e a página não a listasse —, o primeiro "Salvar regras"
 * desligaria em silêncio a regra que o painel acabou de criar (o editor desliga
 * o que não vê). Ganho segue recusado: a venda é outro consumidor.
 */
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

type Linha = Record<string, unknown>;
const ETAPA_PERDIDA = "11111111-1111-4111-8111-111111111111";
const ETAPA_GANHA = "22222222-2222-4222-8222-222222222222";
const ETAPA_DE_OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const tabelas: Record<string, Linha[]> = {};

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
    in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q),
    upsert: (linhas: Linha[]) => {
      for (const n of linhas) {
        const i = (tabelas[tabela] ??= []).findIndex(
          (l) => l.organization_id === n.organization_id && l.stage_id === n.stage_id,
        );
        if (i >= 0) tabelas[tabela][i] = { ...tabelas[tabela][i], ...n };
        else tabelas[tabela].push(n);
      }
      return Promise.resolve({ error: null });
    },
    update: (patch: Linha) => ({
      eq: (c: string, v: unknown) => ({
        in: (c2: string, vs: unknown[]) => {
          for (const l of tabelas[tabela] ?? [])
            if (l[c] === v && vs.includes(l[c2])) Object.assign(l, patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    then: (ok: (r: { data: Linha[]; error: null }) => unknown) =>
      ok({ data: (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l))), error: null }),
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: consulta }) }));

import { salvarRegrasDeConversaoGa4 } from "@/app/actions/settings/salvarRegrasDeConversaoGa4";

beforeEach(() => {
  tabelas.crm_stages = [
    { id: ETAPA_PERDIDA, organization_id: "org-1", is_won: false, is_lost: true },
    { id: ETAPA_GANHA, organization_id: "org-1", is_won: true, is_lost: false },
    { id: ETAPA_DE_OUTRA_ORG, organization_id: "org-2", is_won: false, is_lost: true },
  ];
  tabelas.ga4_conversion_rules = [];
});

describe("regra do GA4 em etapa perdida", () => {
  it("aceita ligar close_unconvert_lead na etapa perdida da organização", async () => {
    const r = await salvarRegrasDeConversaoGa4([
      { stage_id: ETAPA_PERDIDA, enabled: true, ga4_event: "close_unconvert_lead" },
    ]);
    expect(r).toEqual({ ok: true });
    expect(tabelas.ga4_conversion_rules).toEqual([
      expect.objectContaining({
        stage_id: ETAPA_PERDIDA,
        ga4_event: "close_unconvert_lead",
        enabled: true,
        event_name: `GA4Etapa:${ETAPA_PERDIDA}`,
      }),
    ]);
  });

  it("salvar a lista com a etapa perdida não desliga a regra dela", async () => {
    tabelas.ga4_conversion_rules = [
      {
        organization_id: "org-1",
        stage_id: ETAPA_PERDIDA,
        event_name: `GA4Etapa:${ETAPA_PERDIDA}`,
        ga4_event: "close_unconvert_lead",
        enabled: true,
      },
    ];
    await salvarRegrasDeConversaoGa4([
      { stage_id: ETAPA_PERDIDA, enabled: true, ga4_event: "close_unconvert_lead" },
    ]);
    expect(tabelas.ga4_conversion_rules[0]).toMatchObject({ enabled: true });
  });

  it("segue recusando etapa ganha e etapa de outra organização", async () => {
    for (const stage_id of [ETAPA_GANHA, ETAPA_DE_OUTRA_ORG]) {
      const r = await salvarRegrasDeConversaoGa4([
        { stage_id, enabled: true, ga4_event: "close_unconvert_lead" },
      ]);
      expect(r).toEqual({ ok: false, error: "etapa_invalida" });
    }
    expect(tabelas.ga4_conversion_rules).toEqual([]);
  });
});
