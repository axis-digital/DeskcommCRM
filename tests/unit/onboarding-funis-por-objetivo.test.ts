/**
 * Passo "funil" do onboarding com o PERFIL DO NEGÓCIO (Entrega 1 / workstream B).
 *
 * Dirige a action REAL `aplicarQuadro` contra um banco de mentira que GUARDA o
 * que foi escrito — sem estado que sobrevive entre chamadas, o "reaplicar não
 * duplica" passaria por vacuidade.
 *
 * O que se prova:
 *  - com perfil multi-objetivo, o funil padrão recebe `settings.objetivo` do 1º
 *    objetivo (MERGE: as outras chaves de settings sobrevivem) e nasce um funil
 *    por objetivo extra MARCADO, com etapas, passo e `settings.objetivo`;
 *  - sem perfil, nada muda em relação ao comportamento anterior;
 *  - reaplicar não duplica funil do mesmo objetivo;
 *  - o `organization_id` de toda escrita é o do contexto, nunca do corpo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const USER = "11111111-1111-4111-8111-111111111111";
const PADRAO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

interface Pipeline {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  position: number;
  is_default: boolean;
  is_archived: boolean;
  settings: Record<string, unknown>;
}
interface Stage {
  organization_id: string;
  pipeline_id: string;
  name: string;
  slug: string;
  agent_stage_hint: string | null;
  is_won: boolean;
  is_lost: boolean;
}

const db = vi.hoisted(() => ({
  orgSettings: {} as Record<string, unknown>,
  pipelines: [] as Pipeline[],
  stages: [] as Stage[],
  rpcs: [] as Array<{ nome: string; args: Record<string, unknown> }>,
  seq: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT: ${url}`);
    (err as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url}`;
    throw err;
  },
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({
    id: USER,
    email: "dono@qa.local",
    full_name: "Dono",
    organizations: [],
  })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: ORG, name: "QA", role: "admin" })),
}));
// A IA não é chamada em `aplicarQuadro`; os módulos pesados ficam de fora.
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/runtime/agent", () => ({ buildModel: vi.fn(), chaveDePlataforma: vi.fn() }));
vi.mock("@/lib/ai/credentials", () => ({ loadCredential: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso() }));

import { aplicarQuadro } from "@/app/actions/onboarding/montarQuadro";
import { audit } from "@/lib/audit";

type Filtros = Record<string, unknown>;

function casa(linha: Record<string, unknown>, filtros: Filtros): boolean {
  return Object.entries(filtros).every(([k, v]) =>
    k.startsWith("neq:") ? linha[k.slice(4)] !== v : linha[k] === v,
  );
}

/** Builder no formato do PostgREST, com estado guardado em `db`. */
function clienteFalso() {
  const abrir = (table: string) => {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: unknown = null;
    const filtros: Filtros = {};

    const executar = (): { data: unknown; error: null | { message: string } } => {
      if (table === "organizations") {
        if (op === "update") return { data: null, error: null };
        return {
          data: [{ settings: db.orgSettings, onboarding_state: {}, onboarded_at: null }],
          error: null,
        };
      }
      if (table === "crm_pipelines") {
        if (op === "insert") {
          const linhas = (Array.isArray(payload) ? payload : [payload]) as Array<Partial<Pipeline>>;
          const criadas = linhas.map((l) => {
            db.seq += 1;
            const p: Pipeline = {
              id: `novo-${db.seq}`,
              organization_id: String(l.organization_id),
              name: String(l.name),
              slug: String(l.slug),
              position: Number(l.position ?? 0),
              is_default: Boolean(l.is_default),
              is_archived: false,
              settings: (l.settings as Record<string, unknown>) ?? {},
            };
            db.pipelines.push(p);
            return p;
          });
          return { data: criadas, error: null };
        }
        if (op === "update") {
          for (const p of db.pipelines) {
            if (casa(p as unknown as Record<string, unknown>, filtros)) Object.assign(p, payload);
          }
          return { data: null, error: null };
        }
        if (op === "delete") {
          db.pipelines = db.pipelines.filter(
            (p) => !casa(p as unknown as Record<string, unknown>, filtros),
          );
          return { data: null, error: null };
        }
        return {
          data: db.pipelines.filter((p) => casa(p as unknown as Record<string, unknown>, filtros)),
          error: null,
        };
      }
      if (table === "crm_stages") {
        if (op === "insert") {
          db.stages.push(...((Array.isArray(payload) ? payload : [payload]) as Stage[]));
          return { data: null, error: null };
        }
        return {
          data: db.stages
            .filter((s) => casa(s as unknown as Record<string, unknown>, filtros))
            .map((s, i) => ({ name: s.name, position: i })),
          error: null,
        };
      }
      return { data: null, error: null };
    };

    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: unknown) => {
        op = "insert";
        payload = p;
        return b;
      },
      update: (p: unknown) => {
        op = "update";
        payload = p;
        return b;
      },
      delete: () => {
        op = "delete";
        return b;
      },
      eq: (c: string, v: unknown) => {
        filtros[c] = v;
        return b;
      },
      neq: (c: string, v: unknown) => {
        filtros[`neq:${c}`] = v;
        return b;
      },
      is: (c: string, v: unknown) => {
        filtros[c] = v;
        return b;
      },
      order: () => b,
      limit: () => b,
      single: () => {
        const r = executar();
        return Promise.resolve({
          ...r,
          data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
        });
      },
      maybeSingle: () => {
        const r = executar();
        return Promise.resolve({
          ...r,
          data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
        });
      },
      then: (ok: (r: unknown) => unknown, no?: (e: unknown) => unknown) =>
        Promise.resolve(executar()).then(ok, no),
    };
    return b;
  };

  return {
    from: abrir,
    rpc: (nome: string, args: Record<string, unknown>) => {
      db.rpcs.push({ nome, args });
      const p = db.pipelines.find(
        (x) => x.id === args.p_pipeline_id && x.organization_id === args.p_organization_id,
      );
      if (p) {
        p.name = String(args.p_nome);
        p.slug = String(args.p_slug);
      }
      return Promise.resolve({ data: { ok: true, etapas: 5 }, error: null });
    },
  } as never;
}

const QUADRO = {
  nome: "Agendamentos",
  etapas: [
    { nome: "Novo contato", passo: "new" },
    { nome: "Já respondi", passo: "contacted" },
    { nome: "Entendendo o caso", passo: "qualifying" },
    { nome: "Consulta marcada", passo: "won" },
    { nome: "Não vai marcar", passo: "lost" },
  ],
};

function form(extras?: unknown, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("quadro", JSON.stringify(QUADRO));
  fd.set("origem", "ia");
  if (extras !== undefined) fd.set("extras", JSON.stringify(extras));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

async function aplicar(fd: FormData) {
  try {
    return await aplicarQuadro(fd);
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) return "redirect";
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  db.seq = 0;
  db.stages = [];
  db.rpcs = [];
  db.orgSettings = {};
  db.pipelines = [
    {
      id: PADRAO_ID,
      organization_id: ORG,
      name: "Pedidos",
      slug: "pedidos",
      position: 1000,
      is_default: true,
      is_archived: false,
      settings: { fields: [{ key: "endereco" }], lost_reasons: ["caro"] },
    },
    // Funil de OUTRA organização com o mesmo objetivo: não pode contar.
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: OUTRA_ORG,
      name: "Vendas",
      slug: "vendas",
      position: 1000,
      is_default: true,
      is_archived: false,
      settings: { objetivo: "vender_produto" },
    },
  ];
});

const daOrg = () => db.pipelines.filter((p) => p.organization_id === ORG);

describe("aplicarQuadro com perfil do negócio", () => {
  it("perfil multi: o padrão ganha o 1º objetivo por MERGE e nasce um funil por extra marcado", async () => {
    db.orgSettings = {
      perfil_de_negocio: {
        canais: ["whatsapp"],
        objetivos: ["agendar", "vender_produto", "captar_lead"],
      },
    };

    expect(await aplicar(form(["vender_produto", "captar_lead"]))).toBe("redirect");

    const padrao = daOrg().find((p) => p.id === PADRAO_ID)!;
    expect(padrao.settings).toEqual({
      fields: [{ key: "endereco" }],
      lost_reasons: ["caro"],
      objetivo: "agendar",
    });

    const extras = daOrg().filter((p) => p.id !== PADRAO_ID);
    expect(extras.map((p) => p.settings.objetivo).sort()).toEqual([
      "captar_lead",
      "vender_produto",
    ]);
    for (const extra of extras) {
      expect(extra.is_default).toBe(false);
      const etapas = db.stages.filter((s) => s.pipeline_id === extra.id);
      expect(etapas.length).toBeGreaterThanOrEqual(5);
      expect(etapas.every((s) => s.organization_id === ORG)).toBe(true);
      expect(etapas.filter((s) => s.is_won)).toHaveLength(1);
      expect(etapas.filter((s) => s.is_lost)).toHaveLength(1);
      expect(etapas.some((s) => s.agent_stage_hint === "qualified")).toBe(true);
    }
    expect(new Set(daOrg().map((p) => p.slug)).size).toBe(daOrg().length);

    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "pipeline.created", organizationId: ORG }),
    );
  });

  it("extra DESMARCADO não nasce", async () => {
    db.orgSettings = {
      perfil_de_negocio: { canais: [], objetivos: ["agendar", "vender_produto", "captar_lead"] },
    };
    await aplicar(form(["captar_lead"]));
    expect(
      daOrg()
        .filter((p) => p.id !== PADRAO_ID)
        .map((p) => p.settings.objetivo),
    ).toEqual(["captar_lead"]);
  });

  it("o corpo não inventa funil: objetivo fora do perfil é ignorado", async () => {
    db.orgSettings = {
      perfil_de_negocio: { canais: [], objetivos: ["agendar", "vender_produto"] },
    };
    await aplicar(
      form(["vender_servico", "agendar", "vender_produto"], { organization_id: OUTRA_ORG }),
    );
    expect(
      daOrg()
        .filter((p) => p.id !== PADRAO_ID)
        .map((p) => p.settings.objetivo),
    ).toEqual(["vender_produto"]);
    // Nenhuma escrita foi para a outra organização.
    expect(db.pipelines.filter((p) => p.organization_id === OUTRA_ORG)).toHaveLength(1);
    expect(db.rpcs.every((r) => r.args.p_organization_id === ORG)).toBe(true);
  });

  it("reaplicar não duplica funil do mesmo objetivo", async () => {
    db.orgSettings = {
      perfil_de_negocio: { canais: [], objetivos: ["agendar", "vender_produto", "captar_lead"] },
    };
    await aplicar(form(["vender_produto", "captar_lead"]));
    const depoisDoPrimeiro = daOrg().length;
    await aplicar(form(["vender_produto", "captar_lead"]));
    expect(daOrg().length).toBe(depoisDoPrimeiro);
    expect(daOrg().length).toBe(3);
  });

  it("sem perfil: nenhum funil extra e o settings do padrão fica intocado", async () => {
    const antes = structuredClone(daOrg().find((p) => p.id === PADRAO_ID)!.settings);
    expect(await aplicar(form(["vender_produto"]))).toBe("redirect");
    expect(daOrg()).toHaveLength(1);
    expect(daOrg()[0]!.settings).toEqual(antes);
    expect(db.stages).toHaveLength(0);
    expect(db.rpcs).toHaveLength(1);
  });

  it("perfil com um objetivo só: grava o objetivo no padrão e não cria extra", async () => {
    db.orgSettings = {
      perfil_de_negocio: { canais: ["instagram"], objetivos: ["vender_servico"] },
    };
    await aplicar(form());
    expect(daOrg()).toHaveLength(1);
    expect(daOrg()[0]!.settings.objetivo).toBe("vender_servico");
  });

  it("objetivo já escolhido no editor de funil sobrevive à reaplicação do passo", async () => {
    db.pipelines[0]!.settings = { ...db.pipelines[0]!.settings, objetivo: "vender_servico" };
    db.orgSettings = {
      perfil_de_negocio: { canais: ["whatsapp"], objetivos: ["agendar"] },
    };
    await aplicar(form());
    expect(daOrg().find((p) => p.id === PADRAO_ID)!.settings.objetivo).toBe("vender_servico");
  });
});
