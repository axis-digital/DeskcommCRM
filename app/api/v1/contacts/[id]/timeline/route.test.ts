import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A LINHA DO TEMPO DO CONTATO SOMA OS PEDIDOS DA LOJA.
 *
 * `crm_lead_activities.lead_id` é NOT NULL: contato que só comprou (e não tem
 * negócio) nunca teria uma atividade gravada. Na Lilaliz, 180 dos 183 contatos
 * com pedido da Nuvemshop estão nessa situação. Por isso a rota PROJETA a
 * tabela `orders` na linha do tempo, em tempo de leitura — sem segunda cópia do
 * dado, sem backfill, e retroativo para todo pedido já sincronizado.
 *
 * O que este arquivo mede, pela rota (o que a tela não prova sozinha):
 *   1. o pedido aparece, ordenado junto das atividades, sem `lead_id`;
 *   2. a consulta de pedidos é por contato E organização;
 *   3. o filtro `?type=` e o cursor valem para os pedidos também;
 *   4. a paginação conta os pedidos (não corta nem repete).
 */

const mocks = vi.hoisted(() => ({
  tabelas: {} as Record<string, { data: unknown; error: unknown }>,
  chamadas: [] as Array<{ tabela: string; op: string; args: unknown[] }>,
  tabelasConsultadas: [] as string[],
}));

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: async () => ({ idioma: "pt-BR" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: (tabela: string) => {
      mocks.tabelasConsultadas.push(tabela);
      const resultado = mocks.tabelas[tabela] ?? { data: [], error: null };
      const cadeia: unknown = new Proxy(
        {},
        {
          get(_alvo, op: string) {
            if (op === "then") return (resolve: (v: unknown) => unknown) => resolve(resultado);
            return (...args: unknown[]) => {
              mocks.chamadas.push({ tabela, op, args });
              return cadeia;
            };
          },
        },
      );
      return cadeia;
    },
  }),
}));

import { GET } from "./route";

const ORG = "bc1e396c-9917-4381-8f43-ad99fba137c2";
const CONTATO = "6fcae1d2-5be4-4ad8-900a-3c9f1fd9b1fd";

const atividade = (id: string, performed_at: string, type = "note") => ({
  id,
  organization_id: ORG,
  lead_id: "l1",
  contact_id: CONTATO,
  source_module: "crm",
  source_id: null,
  type,
  payload: {},
  metadata: {},
  performed_at,
  performed_by_user_id: null,
  actor_kind: "system",
  actor_agent_id: null,
  reason: null,
  evidence: null,
});

const pedido = (id: string, ordered_at: string, numero: string) => ({
  id,
  organization_id: ORG,
  contact_id: CONTATO,
  external_provider: "nuvemshop",
  external_id: `ext-${numero}`,
  status: "shipped",
  total_cents: 37990,
  currency: "BRL",
  ordered_at,
  numero,
});

function chamar(query = "") {
  const req = new NextRequest(`http://localhost/api/v1/contacts/${CONTATO}/timeline${query}`);
  return GET(req, { params: Promise.resolve({ id: CONTATO }) });
}

type Corpo = {
  data: Array<Record<string, unknown>>;
  meta: { cursor: string | null; has_more: boolean };
};

beforeEach(() => {
  mocks.chamadas.length = 0;
  mocks.tabelasConsultadas.length = 0;
  mocks.tabelas = {
    contacts: { data: { id: CONTATO, organization_id: ORG }, error: null },
    crm_leads: { data: [], error: null },
    crm_lead_activities: { data: [], error: null },
    orders: { data: [], error: null },
  };
});

describe("GET /contacts/[id]/timeline — pedidos da loja", () => {
  it("mostra o pedido de um contato SEM negócio, com a data do pedido", async () => {
    mocks.tabelas.orders = {
      data: [pedido("o1", "2026-10-06T14:33:12.123+00:00", "380")],
      error: null,
    };

    const corpo = (await (await chamar()).json()) as Corpo;

    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0]).toMatchObject({
      id: "o1",
      type: "order_placed",
      source_module: "nuvemshop",
      lead_id: null,
      performed_at: "2026-10-06T14:33:12.123+00:00",
      payload: { numero: "380", status: "shipped", total_cents: 37990, currency: "BRL" },
    });
  });

  it("intercala pedidos e atividades pela data, do mais recente para o mais antigo", async () => {
    mocks.tabelas.crm_lead_activities = {
      data: [
        atividade("a1", "2026-10-07T10:00:00.000+00:00"),
        atividade("a2", "2026-10-01T10:00:00.000+00:00"),
      ],
      error: null,
    };
    mocks.tabelas.orders = {
      data: [pedido("o1", "2026-10-06T14:33:12.123+00:00", "380")],
      error: null,
    };

    const corpo = (await (await chamar()).json()) as Corpo;

    expect(corpo.data.map((i) => i.id)).toEqual(["a1", "o1", "a2"]);
  });

  it("consulta os pedidos por contato E organização, nunca só pelo que a RLS deixar", async () => {
    await chamar();

    const filtros = mocks.chamadas
      .filter((c) => c.tabela === "orders" && c.op === "eq")
      .map((c) => c.args);
    expect(filtros).toContainEqual(["contact_id", CONTATO]);
    expect(filtros).toContainEqual(["organization_id", ORG]);
  });

  it("não pede o payload inteiro do pedido", async () => {
    await chamar();

    const select = mocks.chamadas.find((c) => c.tabela === "orders" && c.op === "select");
    expect(String(select?.args[0])).toContain("numero:payload->>number");
    expect(String(select?.args[0])).not.toMatch(/(^|, )payload(,|$)/);
  });

  it("?type= de outro tipo não traz pedido e nem consulta a tabela", async () => {
    mocks.tabelas.orders = {
      data: [pedido("o1", "2026-10-06T14:33:12.123+00:00", "380")],
      error: null,
    };

    const corpo = (await (await chamar("?type=note")).json()) as Corpo;

    expect(corpo.data.find((i) => i.id === "o1")).toBeUndefined();
    expect(mocks.tabelasConsultadas).not.toContain("orders");
  });

  it("?type=order_placed traz o pedido", async () => {
    mocks.tabelas.orders = {
      data: [pedido("o1", "2026-10-06T14:33:12.123+00:00", "380")],
      error: null,
    };

    const corpo = (await (await chamar("?type=order_placed")).json()) as Corpo;

    expect(corpo.data.map((i) => i.id)).toContain("o1");
  });

  it("o cursor da página seguinte também corta os pedidos", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        performed_at: "2026-10-05T00:00:00.000+00:00",
        id: "00000000-0000-4000-8000-000000000000",
      }),
    ).toString("base64url");

    await chamar(`?cursor=${cursor}`);

    const filtro = mocks.chamadas.find((c) => c.tabela === "orders" && c.op === "or");
    expect(String(filtro?.args[0])).toContain("ordered_at.lt.2026-10-05T00:00:00.000+00:00");
  });

  it("a paginação conta os pedidos: com limit=2 e 3 itens, devolve 2 e avisa que há mais", async () => {
    mocks.tabelas.crm_lead_activities = {
      data: [atividade("a1", "2026-10-07T10:00:00.000+00:00")],
      error: null,
    };
    mocks.tabelas.orders = {
      data: [
        pedido("o1", "2026-10-06T14:33:12.123+00:00", "380"),
        pedido("o2", "2026-10-05T14:33:12.123+00:00", "379"),
      ],
      error: null,
    };

    const corpo = (await (await chamar("?limit=2")).json()) as Corpo;

    expect(corpo.data.map((i) => i.id)).toEqual(["a1", "o1"]);
    expect(corpo.meta.has_more).toBe(true);
    expect(corpo.meta.cursor).toEqual(expect.any(String));
  });

  it("erro na leitura dos pedidos vira 500, não uma linha do tempo incompleta", async () => {
    mocks.tabelas.orders = { data: null, error: { message: "boom" } };

    const resposta = await chamar();

    expect(resposta.status).toBe(500);
  });
});
