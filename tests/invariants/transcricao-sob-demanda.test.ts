import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  GOV_ORG,
  GOV_MANAGER,
  GOV_CONV_UNASSIGNED,
  GOV_CONTACT_1,
  GOV_SESSION,
  seedGov,
} from "./gov-helpers";

const f = vi.hoisted(() => ({ orgId: "", pool: null as pg.Pool | null }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: { id: "u1", idioma: "pt-BR" },
    org: { orgId: f.orgId },
  }),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => f.pool }));
import { GET, POST } from "@/app/api/v1/messages/[id]/transcription/route";
import { reabrirAudiosParaIA } from "@/lib/messaging/media/leitura-adiada";

const id = "99110000-0000-4000-8000-000000000001";
const outraOrg = "99110000-0000-4000-8000-000000000002";
const chamar = (method: "GET" | "POST") =>
  (method === "GET" ? GET : POST)(
    new NextRequest(`http://localhost/api/v1/messages/${id}/transcription`, { method }),
    { params: Promise.resolve({ id }) },
  );

beforeAll(async () => {
  seedGov();
  f.orgId = GOV_ORG;
  f.pool = new pg.Pool({
    host: "127.0.0.1",
    port: Number(process.env.TEST_DB_PORT),
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });
  await f.pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1,'transcricao-b','Transcrição B','Transcrição B')",
    [outraOrg],
  );
  await f.pool.query(
    `insert into messages(id,organization_id,conversation_id,contact_id,channel_session_id,
    direction,type,status,media_storage_path,media_derived_status,sent_at,metadata)
    values($1,$2,$3,$4,$5,'inbound','audio','received',$6,'skipped',now(),'{"media_status":"stored"}')`,
    [id, GOV_ORG, GOV_CONV_UNASSIGNED, GOV_CONTACT_1, GOV_SESSION, `${GOV_ORG}/conversa/audio.ogg`],
  );
});
afterAll(async () => {
  await f.pool?.end();
});

describe("transcrição por clique no banco do baseline", () => {
  it("não enfileira nada antes do clique", async () => {
    const count = await f.pool!.query(
      "select count(*)::int as n from event_log where event_type='media.derive_requested' and entity_id=$1",
      [id],
    );
    expect(count.rows[0].n).toBe(0);
  });
  it("duas pessoas clicando ao mesmo tempo produzem um evento, com consentimento manual", async () => {
    const respostas = await Promise.all([chamar("POST"), chamar("POST")]);
    expect(respostas.map((r) => r.status)).toEqual([202, 202]);
    const { rows } = await f.pool!.query(
      "select payload from event_log where event_type='media.derive_requested' and entity_id=$1",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ message_id: id, transcricao_manual: true });
    const { rows: mensagens } = await f.pool!.query(
      "select media_derived_status,metadata from messages where id=$1",
      [id],
    );
    expect(mensagens[0].media_derived_status).toBeNull();
    expect(mensagens[0].metadata.transcricao_solicitada_em).toBeTruthy();
  });
  it("outra empresa não lê o resultado nem cria pedido", async () => {
    f.orgId = outraOrg;
    try {
      expect((await chamar("GET")).status).toBe(404);
      expect((await chamar("POST")).status).toBe(404);
    } finally {
      f.orgId = GOV_ORG;
    }
  });
  it("transcrição pronta é reutilizada sem outro gasto", async () => {
    await f.pool!.query(
      "update messages set media_derived_status='ready',media_derived_text='Olá, quero uma reunião' where id=$1",
      [id],
    );
    const resposta = await chamar("POST");
    expect((await resposta.json()).data).toMatchObject({
      status: "ready",
      text: "Olá, quero uma reunião",
    });
  });
  it("não altera quem está atendendo a conversa", async () => {
    const { rows } = await f.pool!.query(
      "select assigned_to_user_id from conversations where id=$1",
      [GOV_CONV_UNASSIGNED],
    );
    expect(rows[0].assigned_to_user_id).not.toBe(GOV_MANAGER);
    expect(rows[0].assigned_to_user_id).toBeNull();
  });

  it("ao devolver para a IA, reabre os áudios guardados pelo humano uma única vez", async () => {
    await f.pool!.query(
      "update messages set media_derived_status='skipped',media_derived_text=null,metadata=metadata||'{\"transcricao_sob_demanda\":true}' where id=$1",
      [id],
    );
    expect(await reabrirAudiosParaIA(f.pool!, GOV_ORG, GOV_CONV_UNASSIGNED, 100)).toBe(1);
    expect(await reabrirAudiosParaIA(f.pool!, GOV_ORG, GOV_CONV_UNASSIGNED, 100)).toBe(0);
    const { rows } = await f.pool!.query(
      "select payload from event_log where entity_id=$1 and metadata->>'source'='retomada_audio'",
      [id],
    );
    expect(rows[0].payload.transcricao_manual).toBeUndefined();
  });
});
