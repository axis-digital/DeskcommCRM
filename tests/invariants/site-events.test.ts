import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * `site_events` e `fn_gravar_evento_do_site` (migration 9040): o evento do site
 * (cadastro na loja, carrinho, checkout, abandono) é guardado uma vez por fato,
 * nunca com contato de outra organização ou anonimizado, lido só pela própria
 * organização e escrito só pelo servidor.
 *
 * O isolamento entre organizações é medido com `authenticated` DE VERDADE
 * (`set role` + `request.jwt.claims`, como o PostgREST faz), não com a conexão
 * de dono, que ignora a RLS.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});

const ORG_A = "c1a0f612-0000-4000-8000-00000000000a";
const ORG_B = "c1a0f612-0000-4000-8000-00000000000b";
const USER_A = "c1a0f612-1111-4000-8000-00000000000a";
const USER_B = "c1a0f612-1111-4000-8000-00000000000b";
const CONTATO_A = "c1a0f612-0000-4000-8000-0000000000ca";
const CONTATO_A2 = "c1a0f612-0000-4000-8000-0000000000c2";
const CONTATO_B = "c1a0f612-0000-4000-8000-0000000000cb";
const CONTATO_ANON = "c1a0f612-0000-4000-8000-0000000000cd";
const CONTATO_PARA_ANONIMIZAR = "c1a0f612-0000-4000-8000-0000000000ce";

function evento(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "carrinho_abandonado",
    source: "nuvemshop",
    dedupe_key: "carrinho_abandonado:1001",
    occurred_at: "2026-10-20T10:00:00Z",
    contact_id: CONTATO_A,
    ga_client_id: null,
    ga_session_id: null,
    payload: { total_cents: 15090, currency: "BRL" },
    ...over,
  };
}

async function gravar(org: string, e: Record<string, unknown>): Promise<string | null> {
  const { rows } = await pool.query<{ id: string | null }>(
    "select public.fn_gravar_evento_do_site($1, $2::jsonb) as id",
    [org, JSON.stringify(e)],
  );
  return rows[0]!.id;
}

async function linha(org: string, dedupe = "carrinho_abandonado:1001") {
  const { rows } = await pool.query(
    `select id, kind, contact_id, occurred_at, payload from public.site_events
      where organization_id = $1 and dedupe_key = $2`,
    [org, dedupe],
  );
  return rows[0];
}

/** Lê `site_events` como a pessoa logada daquela organização, com a RLS valendo. */
async function lerComo(userId: string): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId }),
    ]);
    const { rows } = await client.query<{ dedupe_key: string }>(
      "select dedupe_key from public.site_events order by dedupe_key",
    );
    return rows.map((r) => r.dedupe_key);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

beforeAll(async () => {
  for (const [id, slug] of [
    [ORG_A, "site-ev-a"],
    [ORG_B, "site-ev-b"],
  ]) {
    await pool.query(
      "insert into organizations (id, slug, legal_name, display_name) values ($1, $2::text, $2::text, $2::text)",
      [id, slug],
    );
  }
  for (const [user, org, tag] of [
    [USER_A, ORG_A, "a"],
    [USER_B, ORG_B, "b"],
  ]) {
    await pool.query(
      "insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing",
      [user, `site-ev-${tag}@invariant.test`],
    );
    await pool.query(
      "insert into public.user_organizations (user_id, organization_id, role, accepted_at) values ($1, $2, 'agent', now())",
      [user, org],
    );
  }
  await pool.query(
    `insert into contacts (id, organization_id, name) values
       ($1, $2, 'Contato A'), ($3, $2, 'Contato A2'), ($4, $5, 'Contato de B')`,
    [CONTATO_A, ORG_A, CONTATO_A2, CONTATO_B, ORG_B],
  );
  await pool.query(
    "insert into contacts (id, organization_id, name, is_anonymized, anonymized_at) values ($1, $2, 'Anonimizado', true, now())",
    [CONTATO_ANON, ORG_A],
  );
});

afterAll(async () => {
  await pool.query("delete from site_events where organization_id in ($1, $2)", [ORG_A, ORG_B]);
  await pool.query("delete from contacts where organization_id in ($1, $2)", [ORG_A, ORG_B]);
  await pool.query("delete from user_organizations where user_id in ($1, $2)", [USER_A, USER_B]);
  await pool.query("delete from auth.users where id in ($1, $2)", [USER_A, USER_B]);
  await pool.query("delete from organizations where id in ($1, $2)", [ORG_A, ORG_B]);
  await pool.end();
});

describe("fn_gravar_evento_do_site", () => {
  it("insere na primeira vez e devolve o id", async () => {
    const id = await gravar(ORG_A, evento());
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await linha(ORG_A))?.kind).toBe("carrinho_abandonado");
  });

  it("o mesmo fato regravado não duplica: devolve o mesmo id, atualiza o payload e mantém a data do primeiro registro", async () => {
    const primeiro = (await linha(ORG_A))!;
    const id = await gravar(
      ORG_A,
      evento({
        occurred_at: "2026-10-25T10:00:00Z",
        payload: { total_cents: 20000, currency: "BRL" },
      }),
    );
    expect(id).toBe(primeiro.id);
    const depois = (await linha(ORG_A))!;
    expect(depois.payload).toEqual({ total_cents: 20000, currency: "BRL" });
    expect(new Date(depois.occurred_at).toISOString()).toBe(
      new Date(primeiro.occurred_at).toISOString(),
    );
    const { rows } = await pool.query(
      "select count(*)::int as n from public.site_events where organization_id = $1 and dedupe_key = $2",
      [ORG_A, "carrinho_abandonado:1001"],
    );
    expect(rows[0].n).toBe(1);
  });

  it("regravar sem contato não apaga o contato já ligado", async () => {
    await gravar(ORG_A, evento({ contact_id: null }));
    expect((await linha(ORG_A))?.contact_id).toBe(CONTATO_A);
  });

  it("regravar com OUTRO contato não troca o dono do fato", async () => {
    await gravar(ORG_A, evento({ contact_id: CONTATO_A2 }));
    expect((await linha(ORG_A))?.contact_id).toBe(CONTATO_A);
  });

  it("o contato que faltava é completado quando o mesmo fato volta com ele", async () => {
    await gravar(ORG_A, evento({ dedupe_key: "cadastro:77", kind: "cadastro", contact_id: null }));
    expect((await linha(ORG_A, "cadastro:77"))?.contact_id).toBeNull();
    await gravar(
      ORG_A,
      evento({ dedupe_key: "cadastro:77", kind: "cadastro", contact_id: CONTATO_A }),
    );
    expect((await linha(ORG_A, "cadastro:77"))?.contact_id).toBe(CONTATO_A);
  });

  it("contato de OUTRA organização vira null", async () => {
    await gravar(
      ORG_A,
      evento({ dedupe_key: "cadastro:78", kind: "cadastro", contact_id: CONTATO_B }),
    );
    expect((await linha(ORG_A, "cadastro:78"))?.contact_id).toBeNull();
  });

  it("contato ANONIMIZADO não recebe histórico", async () => {
    await gravar(
      ORG_A,
      evento({ dedupe_key: "cadastro:79", kind: "cadastro", contact_id: CONTATO_ANON }),
    );
    expect((await linha(ORG_A, "cadastro:79"))?.contact_id).toBeNull();
  });

  it("a mesma chave em organizações diferentes são fatos diferentes", async () => {
    await gravar(ORG_B, evento({ contact_id: CONTATO_B }));
    expect((await linha(ORG_B))?.contact_id).toBe(CONTATO_B);
    expect((await linha(ORG_A))?.contact_id).toBe(CONTATO_A);
  });

  it("anon e authenticated não executam; service_role executa", async () => {
    const { rows } = await pool.query<{ anon: boolean; auth: boolean; svc: boolean }>(
      `select has_function_privilege('anon', 'public.fn_gravar_evento_do_site(uuid, jsonb)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.fn_gravar_evento_do_site(uuid, jsonb)', 'execute') as auth,
              has_function_privilege('service_role', 'public.fn_gravar_evento_do_site(uuid, jsonb)', 'execute') as svc`,
    );
    expect(rows[0]).toEqual({ anon: false, auth: false, svc: true });
  });
});

describe("site_events — vocabulário e formato", () => {
  it("recusa um kind fora do vocabulário (o pedido não é kind: ele vem de orders)", async () => {
    await expect(
      gravar(ORG_A, evento({ dedupe_key: "x:1", kind: "pedido_realizado" })),
    ).rejects.toThrow(/site_events_kind_check/);
  });

  it("aceita ga_client_id e ga_session_id no formato do GA4", async () => {
    await gravar(
      ORG_A,
      evento({
        dedupe_key: "ga:1",
        kind: "carrinho_adicionado",
        ga_client_id: "1234567890.1700000000",
        ga_session_id: "1761000000",
      }),
    );
    const { rows } = await pool.query(
      "select ga_client_id, ga_session_id from public.site_events where organization_id = $1 and dedupe_key = 'ga:1'",
      [ORG_A],
    );
    expect(rows[0]).toEqual({ ga_client_id: "1234567890.1700000000", ga_session_id: "1761000000" });
  });

  it("recusa ga_client_id malformado em vez de guardar lixo", async () => {
    await expect(
      gravar(
        ORG_A,
        evento({
          dedupe_key: "ga:2",
          kind: "carrinho_adicionado",
          ga_client_id: "nao-e-client-id",
        }),
      ),
    ).rejects.toThrow(/site_events_ga_client_id_check/);
  });
});

describe("site_events — acesso", () => {
  it("cada organização lê só os próprios eventos (RLS, com authenticated de verdade)", async () => {
    const deA = await lerComo(USER_A);
    const deB = await lerComo(USER_B);
    expect(deA.length).toBeGreaterThan(0);
    expect(deB).toEqual(["carrinho_abandonado:1001"]);
    expect(deA).not.toContain("x:1");
    // B só tem 1 evento; os de A (cadastro:77 etc.) não aparecem para B.
    expect(deB.some((k) => k.startsWith("cadastro:"))).toBe(false);
  });

  it("authenticated só lê; nenhum comando de escrita; anon não alcança; service_role faz tudo", async () => {
    const { rows } = await pool.query<Record<string, boolean>>(
      `select
         has_table_privilege('authenticated', 'public.site_events', 'select') as auth_select,
         has_table_privilege('authenticated', 'public.site_events', 'insert') as auth_insert,
         has_table_privilege('authenticated', 'public.site_events', 'update') as auth_update,
         has_table_privilege('authenticated', 'public.site_events', 'delete') as auth_delete,
         has_table_privilege('authenticated', 'public.site_events', 'truncate') as auth_truncate,
         has_table_privilege('anon', 'public.site_events', 'select') as anon_select,
         has_table_privilege('service_role', 'public.site_events', 'select') as svc_select,
         has_table_privilege('service_role', 'public.site_events', 'insert') as svc_insert,
         has_table_privilege('service_role', 'public.site_events', 'update') as svc_update,
         has_table_privilege('service_role', 'public.site_events', 'delete') as svc_delete`,
    );
    expect(rows[0]).toEqual({
      auth_select: true,
      auth_insert: false,
      auth_update: false,
      auth_delete: false,
      auth_truncate: false,
      anon_select: false,
      svc_select: true,
      svc_insert: true,
      svc_update: true,
      svc_delete: true,
    });
  });

  it("anonimizar o contato apaga os eventos dele, e só os dele", async () => {
    await pool.query("insert into contacts (id, organization_id, name) values ($1, $2, 'A anonimizar')", [CONTATO_PARA_ANONIMIZAR, ORG_A]);
    await gravar(ORG_A, evento({ dedupe_key: "anon:1", kind: "cadastro", contact_id: CONTATO_PARA_ANONIMIZAR }));
    await gravar(ORG_A, evento({ dedupe_key: "anon:2", kind: "carrinho_abandonado", contact_id: CONTATO_PARA_ANONIMIZAR }));
    expect(await linha(ORG_A, "anon:1")).toBeDefined();

    await pool.query("update contacts set is_anonymized = true, anonymized_at = now() where id = $1", [CONTATO_PARA_ANONIMIZAR]);

    expect(await linha(ORG_A, "anon:1")).toBeUndefined();
    expect(await linha(ORG_A, "anon:2")).toBeUndefined();
    // O evento de OUTRO contato, da mesma organização, segue lá.
    expect(await linha(ORG_A, "carrinho_abandonado:1001")).toBeDefined();
  });

  it("apagar o contato leva junto os eventos dele (dado pessoal não sobra órfão)", async () => {
    await gravar(
      ORG_A,
      evento({ dedupe_key: "cadastro:80", kind: "cadastro", contact_id: CONTATO_A2 }),
    );
    await pool.query("delete from contacts where id = $1", [CONTATO_A2]);
    expect(await linha(ORG_A, "cadastro:80")).toBeUndefined();
  });
});
