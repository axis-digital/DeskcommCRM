/**
 * IMPORTAR O HISTÓRICO NÃO ACORDA NINGUÉM (migration 0900, fork Axis).
 *
 * O histórico de 365 dias que o celular entrega ao WAHA no pareamento entra por
 * `fn_importar_historico_wa`. O risco é o agente responder hoje a mensagens de
 * meses atrás: todo INSERT em `messages` emite `message.received`, abre demanda
 * e mexe na revisão da conversa. Aqui se mede, contra o banco real:
 *   - nada disso acontece dentro da importação;
 *   - conversa nova nasce `closed` e não pede roteamento;
 *   - reimportar não duplica;
 *   - FORA da importação os gatilhos continuam vivos (controle positivo — sem
 *     ele, um gatilho apagado por engano passaria aqui como "não disparou").
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});

const ORG = "c0900a00-0000-4000-8000-000000000001";
const OUTRA_ORG = "c0900a00-0000-4000-8000-000000000002";
const SESSAO = "c0900a00-0000-4000-8000-0000000000a1";

type Linha = Record<string, unknown>;

function linha(over: Linha = {}): Linha {
  return {
    chat_id: "5531900090001@c.us",
    kind: "phone",
    phone: "+5531900090001",
    lid: null,
    notify: "Cliente Antigo",
    external_id: "false_5531900090001@c.us_3A0001",
    direction: "inbound",
    type: "text",
    body: "oi, mensagem de 2025",
    media_mime: null,
    sent_at: "2025-12-01T12:00:00Z",
    ack: null,
    raw_type: "chat",
    preview: "oi, mensagem de 2025",
    ...over,
  };
}

async function importar(linhas: Linha[], org = ORG): Promise<{ inseridas: number; duplicadas: number; ignoradas: number }> {
  const { rows } = await pool.query<{ r: { inseridas: number; duplicadas: number; ignoradas: number } }>(
    "select public.fn_importar_historico_wa($1, $2, $3::jsonb) as r",
    [org, SESSAO, JSON.stringify(linhas)],
  );
  return rows[0]!.r;
}

async function contar(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(sql, params);
  return rows[0]!.n;
}

const eventosDaOrg = () =>
  contar("select count(*)::int n from event_log where organization_id = $1 and event_type like 'message.%'", [ORG]);
const pedidosDeRoteamento = () =>
  contar("select count(*)::int n from event_log where organization_id = $1 and event_type like '%routing%'", [ORG]);
const demandasDaOrg = () => contar("select count(*)::int n from demandas where organization_id = $1", [ORG]);

beforeAll(async () => {
  for (const [id, slug] of [
    [ORG, "org-historico-0900"],
    [OUTRA_ORG, "org-historico-0900-b"],
  ]) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name)
       values ($1, $2, 'Historico LTDA', 'Historico') on conflict (id) do nothing`,
      [id, slug],
    );
  }
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'sessao-0900', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [SESSAO, ORG],
  );
});

afterAll(async () => {
  await pool.query("delete from organizations where id in ($1, $2)", [ORG, OUTRA_ORG]);
  await pool.end();
});

describe("importação de histórico", () => {
  it("grava contato, conversa e mensagens sem evento, demanda nem roteamento", async () => {
    const [ev0, rot0, dem0] = [await eventosDaOrg(), await pedidosDeRoteamento(), await demandasDaOrg()];

    const r = await importar([
      linha(),
      linha({
        external_id: "3A0002",
        direction: "outbound",
        body: "resposta antiga",
        preview: "resposta antiga",
        notify: null,
        sent_at: "2025-12-01T12:05:00Z",
      }),
    ]);

    expect(r).toEqual({ inseridas: 2, duplicadas: 0, ignoradas: 0 });
    expect(await eventosDaOrg(), "message.* emitido na importação").toBe(ev0);
    expect(await pedidosDeRoteamento(), "roteamento pedido na importação").toBe(rot0);
    expect(await demandasDaOrg(), "demanda aberta na importação").toBe(dem0);

    const { rows } = await pool.query<{
      status: string;
      last_message_preview: string;
      last_inbound_at: Date;
      last_outbound_at: Date;
      unread_count_for_assignee: number;
      reply_context_revision: string;
    }>(
      `select v.status, v.last_message_preview, v.last_inbound_at, v.last_outbound_at,
              v.unread_count_for_assignee, v.reply_context_revision
         from conversations v join contacts c on c.id = v.contact_id
        where v.organization_id = $1 and c.phone_number = '+5531900090001'`,
      [ORG],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("closed");
    expect(rows[0]!.last_message_preview).toBe("resposta antiga");
    expect(rows[0]!.last_inbound_at.toISOString()).toBe("2025-12-01T12:00:00.000Z");
    expect(rows[0]!.last_outbound_at.toISOString()).toBe("2025-12-01T12:05:00.000Z");
    expect(rows[0]!.unread_count_for_assignee).toBe(0);
    // 1 = o DEFAULT da coluna: o gatilho de revisão do inbound não rodou.
    expect(Number(rows[0]!.reply_context_revision)).toBe(1);
  });

  it("reimportar não duplica e não regride o preview", async () => {
    const r = await importar([linha()]);
    expect(r).toEqual({ inseridas: 0, duplicadas: 1, ignoradas: 0 });
    const n = await contar(
      "select count(*)::int n from messages where organization_id = $1 and external_id = 'false_5531900090001@c.us_3A0001'",
      [ORG],
    );
    expect(n).toBe(1);
  });

  it("mensagem mais antiga não rebaixa last_message_* de conversa existente", async () => {
    await importar([linha({ external_id: "false_5531900090001@c.us_3A0000", body: "a primeira", preview: "a primeira", sent_at: "2025-11-01T08:00:00Z" })]);
    const { rows } = await pool.query<{ last_message_preview: string }>(
      `select v.last_message_preview from conversations v join contacts c on c.id = v.contact_id
        where v.organization_id = $1 and c.phone_number = '+5531900090001'`,
      [ORG],
    );
    expect(rows[0]!.last_message_preview).toBe("resposta antiga");
  });

  it("linha sem identidade endereçável ou sem id é ignorada, sem derrubar o lote", async () => {
    const r = await importar([
      linha({ kind: "group", external_id: "x-grupo" }),
      linha({ external_id: null }),
      linha({ direction: "sideways", external_id: "x-dir" }),
    ]);
    expect(r).toEqual({ inseridas: 0, duplicadas: 0, ignoradas: 3 });
  });

  it("sessão de outra organização é recusada", async () => {
    await expect(importar([linha({ external_id: "x-outra" })], OUTRA_ORG)).rejects.toThrow(
      /historico_sessao_fora_da_org/,
    );
  });

  it("controle positivo: fora da importação o INSERT continua emitindo message.received", async () => {
    const { rows } = await pool.query<{ contact_id: string; id: string }>(
      `select v.contact_id, v.id from conversations v join contacts c on c.id = v.contact_id
        where v.organization_id = $1 and c.phone_number = '+5531900090001'`,
      [ORG],
    );
    const ev0 = await eventosDaOrg();
    await pool.query(
      `insert into messages (organization_id, conversation_id, channel_session_id, contact_id, external_id,
                             type, direction, status, body, sent_via, sent_at)
       values ($1, $2, $3, $4, 'false_5531900090001@c.us_3AVIVO', 'text', 'inbound', 'delivered',
               'mensagem de hoje', 'external_device', now())`,
      [ORG, rows[0]!.id, SESSAO, rows[0]!.contact_id],
    );
    expect(await eventosDaOrg(), "gatilho de evento desligado fora da importação").toBe(ev0 + 1);
  });

  it("anon e authenticated não executam a função", async () => {
    const { rows } = await pool.query<{ anon: boolean; auth: boolean; svc: boolean }>(
      `select has_function_privilege('anon', 'public.fn_importar_historico_wa(uuid,uuid,jsonb)', 'execute') anon,
              has_function_privilege('authenticated', 'public.fn_importar_historico_wa(uuid,uuid,jsonb)', 'execute') auth,
              has_function_privilege('service_role', 'public.fn_importar_historico_wa(uuid,uuid,jsonb)', 'execute') svc`,
    );
    expect(rows[0]).toEqual({ anon: false, auth: false, svc: true });
  });
});
