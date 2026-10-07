import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({ id: "u1", support: null })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "org-1" })),
  mfaEmDivida: vi.fn(async () => false),
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({
  podeAdministrarEmpresa: vi.fn(() => true),
}));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: vi.fn(() => null) }));

type Linha = Record<string, unknown>;
const banco: Record<string, Linha[]> = {};
const upserts: Array<{ tabela: string; linhas: Linha[]; opcoes: unknown }> = [];

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  const builder = {
    select: () => builder,
    eq: (coluna: string, valor: unknown) => {
      filtros.push((l) => l[coluna] === valor);
      return builder;
    },
    in: (coluna: string, valores: unknown[]) => {
      filtros.push((l) => valores.includes(l[coluna]));
      return builder;
    },
    order: () => builder,
    then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve({
        data: (banco[tabela] ?? []).filter((l) => filtros.every((f) => f(l))),
        error: null,
      }).then(ok, falha),
    // Imita `on conflict (organization_id, stage_id) do nothing` + `returning`.
    upsert: (linhas: Linha[], opcoes: unknown) => {
      upserts.push({ tabela, linhas, opcoes });
      const atuais = banco[tabela] ?? [];
      const novas = linhas.filter(
        (n) =>
          !atuais.some(
            (a) => a.organization_id === n.organization_id && a.stage_id === n.stage_id,
          ),
      );
      banco[tabela] = [...atuais, ...novas];
      return {
        select: () =>
          Promise.resolve({ data: novas.map((n) => ({ stage_id: n.stage_id })), error: null }),
      };
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (tabela: string) => consulta(tabela) }),
}));

import { aplicarRegrasSugeridasGa4 } from "@/app/actions/settings/aplicarRegrasSugeridasGa4";
import { audit } from "@/lib/audit";
import { mfaEmDivida } from "@/lib/auth/server";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { supportWriteError } from "@/lib/impersonate/support";

const P_PRODUTO = "aaaaaaaa-0000-4000-8000-000000000001";
const P_ARQUIVADO = "aaaaaaaa-0000-4000-8000-000000000002";
const P_OUTRA_ORG = "aaaaaaaa-0000-4000-8000-000000000003";
const S_NOVO = "bbbbbbbb-0000-4000-8000-000000000001";
const S_QUALIFICADO = "bbbbbbbb-0000-4000-8000-000000000002";
const S_PERDIDO = "bbbbbbbb-0000-4000-8000-000000000003";
const S_ARQUIVADO = "bbbbbbbb-0000-4000-8000-000000000004";
const S_OUTRA_ORG = "bbbbbbbb-0000-4000-8000-000000000005";

beforeEach(() => {
  upserts.length = 0;
  vi.mocked(audit).mockClear();
  vi.mocked(podeAdministrarEmpresa).mockReturnValue(true);
  vi.mocked(supportWriteError).mockReturnValue(null);
  vi.mocked(mfaEmDivida).mockResolvedValue(false);
  banco.crm_pipelines = [
    {
      id: P_PRODUTO,
      organization_id: "org-1",
      name: "Loja",
      settings: { objetivo: "vender_produto" },
      is_archived: false,
    },
    {
      id: P_ARQUIVADO,
      organization_id: "org-1",
      name: "Antigo",
      settings: {},
      is_archived: true,
    },
    {
      id: P_OUTRA_ORG,
      organization_id: "org-2",
      name: "Deles",
      settings: {},
      is_archived: false,
    },
  ];
  const etapa = (id: string, pipeline: string, org: string, passo: string) => ({
    id,
    organization_id: org,
    pipeline_id: pipeline,
    name: `Etapa ${passo}`,
    agent_stage_hint: passo,
    is_archived: false,
  });
  banco.crm_stages = [
    etapa(S_NOVO, P_PRODUTO, "org-1", "new"),
    etapa(S_QUALIFICADO, P_PRODUTO, "org-1", "qualified"),
    etapa(S_PERDIDO, P_PRODUTO, "org-1", "lost"),
    etapa(S_ARQUIVADO, P_ARQUIVADO, "org-1", "new"),
    etapa(S_OUTRA_ORG, P_OUTRA_ORG, "org-2", "new"),
  ];
  banco.ga4_conversion_rules = [];
});

describe("aplicarRegrasSugeridasGa4", () => {
  it("cria as regras sugeridas da org, ligadas, com o nome do livro-razão da etapa", async () => {
    const r = await aplicarRegrasSugeridasGa4([
      { stageId: S_NOVO, evento: "generate_lead" },
      { stageId: S_QUALIFICADO, evento: "add_to_cart" },
      { stageId: S_PERDIDO, evento: "close_unconvert_lead" },
    ]);
    expect(r).toEqual({ ok: true, criadas: 3 });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.tabela).toBe("ga4_conversion_rules");
    expect(upserts[0]!.linhas).toEqual(
      expect.arrayContaining([
        {
          organization_id: "org-1",
          stage_id: S_NOVO,
          event_name: `GA4Etapa:${S_NOVO}`,
          ga4_event: "generate_lead",
          enabled: true,
          updated_by: "u1",
        },
      ]),
    );
  });

  it("nunca sobrescreve: etapa que já tem regra é pulada e o insert ignora conflito", async () => {
    banco.ga4_conversion_rules = [
      {
        organization_id: "org-1",
        stage_id: S_NOVO,
        event_name: `GA4Etapa:${S_NOVO}`,
        ga4_event: "qualify_lead",
        enabled: false,
      },
    ];
    const r = await aplicarRegrasSugeridasGa4([
      { stageId: S_NOVO, evento: "generate_lead" },
      { stageId: S_QUALIFICADO, evento: "add_to_cart" },
    ]);
    expect(r).toEqual({ ok: true, criadas: 1 });
    expect(upserts[0]!.opcoes).toMatchObject({
      onConflict: "organization_id,stage_id",
      ignoreDuplicates: true,
    });
    expect(upserts[0]!.linhas.map((l) => l.stage_id)).toEqual([S_QUALIFICADO]);
    expect(banco.ga4_conversion_rules!.find((l) => l.stage_id === S_NOVO)).toMatchObject({
      ga4_event: "qualify_lead",
      enabled: false,
    });
  });

  it("audita a mutação com a contagem criada", async () => {
    await aplicarRegrasSugeridasGa4([{ stageId: S_NOVO, evento: "generate_lead" }]);
    expect(vi.mocked(audit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ga4_conversion_rules.updated",
        actorUserId: "u1",
        organizationId: "org-1",
        resourceType: "ga4_conversion_rules",
        metadata: expect.objectContaining({ origem: "regras_sugeridas", criadas: 1 }),
      }),
    );
  });

  it("sem nada a criar (tudo já configurado) não grava nem audita", async () => {
    banco.ga4_conversion_rules = [
      { organization_id: "org-1", stage_id: S_NOVO, event_name: `GA4Etapa:${S_NOVO}` },
    ];
    const r = await aplicarRegrasSugeridasGa4([{ stageId: S_NOVO, evento: "generate_lead" }]);
    expect(r).toEqual({ ok: true, criadas: 0 });
    expect(upserts).toHaveLength(0);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("recusa etapa de OUTRA organização sem gravar nada", async () => {
    const r = await aplicarRegrasSugeridasGa4([
      { stageId: S_NOVO, evento: "generate_lead" },
      { stageId: S_OUTRA_ORG, evento: "generate_lead" },
    ]);
    expect(r).toMatchObject({ ok: false, error: "sugestao_invalida" });
    expect(upserts).toHaveLength(0);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("recusa evento que diverge da sugestão do servidor", async () => {
    const r = await aplicarRegrasSugeridasGa4([{ stageId: S_QUALIFICADO, evento: "qualify_lead" }]);
    expect(r).toMatchObject({ ok: false, error: "sugestao_invalida" });
    expect(upserts).toHaveLength(0);
  });

  it("recusa etapa de funil arquivado", async () => {
    const r = await aplicarRegrasSugeridasGa4([{ stageId: S_ARQUIVADO, evento: "generate_lead" }]);
    expect(r).toMatchObject({ ok: false, error: "sugestao_invalida" });
    expect(upserts).toHaveLength(0);
  });

  it.each([
    [[{ stageId: S_NOVO, evento: "page_view" }]],
    [[{ stageId: "nao-e-uuid", evento: "generate_lead" }]],
    [[]],
    [
      [
        { stageId: S_NOVO, evento: "generate_lead" },
        { stageId: S_NOVO, evento: "generate_lead" },
      ],
    ],
  ])("entrada inválida (%j) é recusada pelo Zod", async (entrada) => {
    const r = await aplicarRegrasSugeridasGa4(entrada as never);
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(upserts).toHaveLength(0);
  });

  it("RBAC: quem não administra a organização é recusado", async () => {
    vi.mocked(podeAdministrarEmpresa).mockReturnValue(false);
    const r = await aplicarRegrasSugeridasGa4([{ stageId: S_NOVO, evento: "generate_lead" }]);
    expect(r).toEqual({ ok: false, error: "forbidden_role" });
    expect(upserts).toHaveLength(0);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("suporte sem permissão de escrita é recusado antes do efeito", async () => {
    vi.mocked(supportWriteError).mockReturnValue("support_read_only" as never);
    const r = await aplicarRegrasSugeridasGa4([{ stageId: S_NOVO, evento: "generate_lead" }]);
    expect(r).toEqual({ ok: false, error: "forbidden_role" });
    expect(upserts).toHaveLength(0);
  });

  it("MFA em dívida bloqueia a escrita", async () => {
    vi.mocked(mfaEmDivida).mockResolvedValue(true);
    const r = await aplicarRegrasSugeridasGa4([{ stageId: S_NOVO, evento: "generate_lead" }]);
    expect(r).toEqual({ ok: false, error: "mfa_required" });
    expect(upserts).toHaveLength(0);
  });
});
