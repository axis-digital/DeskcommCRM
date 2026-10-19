import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirecionou extends Error {
  constructor(public destino: string) {
    super(destino);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redirecionou(destino);
  },
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({ id: "u1" }),
  resolveActiveOrg: async () => ({ orgId: "org-1", role: "agent" }),
}));

const dados: { lead: { pipeline_id: string } | null; funis: unknown[] } = { lead: null, funis: [] };
const consultas: Array<{ tabela: string; filtros: Record<string, unknown> }> = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      const filtros: Record<string, unknown> = {};
      consultas.push({ tabela, filtros });
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filtros[c] = v;
          return q;
        },
        maybeSingle: async () => ({ data: dados.lead }),
        then: (r: (v: unknown) => unknown) => r({ data: dados.funis }),
      };
      return q;
    },
  }),
}));

import FunilDaAbaPage from "./page";

const destinoDe = async (params: Record<string, string> = {}) => {
  try {
    await FunilDaAbaPage({ searchParams: Promise.resolve(params) });
  } catch (e) {
    if (e instanceof Redirecionou) return e.destino;
    throw e;
  }
  throw new Error("não redirecionou");
};

const funil = (id: string, over: object = {}) => ({
  id,
  name: id,
  position: 0,
  is_default: false,
  is_archived: false,
  ...over,
});

describe("/app/kanban (redirecionador da aba Funis)", () => {
  beforeEach(() => {
    dados.lead = null;
    dados.funis = [];
    consultas.length = 0;
  });

  it("abre o quadro do funil padrão", async () => {
    dados.funis = [funil("a"), funil("b", { position: 1, is_default: true })];
    expect(await destinoDe()).toBe("/app/pipelines/b");
  });

  it("padrão arquivado: cai no primeiro funil vivo", async () => {
    dados.funis = [funil("arq", { is_default: true, is_archived: true }), funil("vivo", { position: 3 })];
    expect(await destinoDe()).toBe("/app/pipelines/vivo");
  });

  it("nenhum funil vivo: vai para a lista, que ensina a criar o primeiro", async () => {
    dados.funis = [funil("arq", { is_archived: true })];
    expect(await destinoDe()).toBe("/app/kanban/funis");
  });

  it("deep link ?lead= abre o funil DO NEGÓCIO, não o padrão", async () => {
    dados.lead = { pipeline_id: "outro-funil" };
    dados.funis = [funil("padrao", { is_default: true })];
    expect(await destinoDe({ lead: "lead-9" })).toBe("/app/pipelines/outro-funil?lead=lead-9");
  });

  it("?lead= de negócio inexistente ou fora do acesso cai no padrão", async () => {
    dados.lead = null;
    dados.funis = [funil("padrao", { is_default: true })];
    expect(await destinoDe({ lead: "lead-9" })).toBe("/app/pipelines/padrao");
  });

  it("filtra por organization_id nas duas consultas (service role/RLS multi-org)", async () => {
    dados.lead = { pipeline_id: "x" };
    await destinoDe({ lead: "lead-9" });
    dados.lead = null;
    dados.funis = [funil("a")];
    await destinoDe({ lead: "lead-9" });
    expect(consultas.length).toBeGreaterThanOrEqual(3);
    for (const c of consultas) expect(c.filtros.organization_id).toBe("org-1");
  });
});
