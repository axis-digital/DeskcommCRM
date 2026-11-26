import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  auth: vi.fn(), support: vi.fn(), audit: vi.fn(), query: vi.fn(), release: vi.fn(),
  message: {} as Record<string, unknown>, pending: false,
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: f.auth }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: f.support }));
vi.mock("@/lib/audit", () => ({ audit: f.audit }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => ({
  connect: async () => ({ query: f.query, release: f.release }),
}) }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
import { POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const orgId = "22222222-2222-4222-8222-222222222222";
const call = (messageId = id) => POST(new NextRequest(`http://localhost/api/v1/messages/${messageId}/transcription`, {
  method: "POST",
}), { params: Promise.resolve({ id: messageId }) });

beforeEach(() => {
  vi.clearAllMocks();
  f.auth.mockResolvedValue({ ok: true, user: { id: "u1", idioma: "pt-BR" }, org: { orgId } });
  f.support.mockResolvedValue(null);
  f.pending = false;
  f.message = { id, type: "audio", media_storage_path: `${orgId}/c1/audio.ogg`,
    media_derived_status: "failed", media_derived_text: null, metadata: {}, body: null,
    is_group: false, is_personal: false, revoked_at: null };
  f.query.mockImplementation(async (sql: string) => {
    if (sql.includes("for update")) return { rows: f.message.id ? [f.message] : [] };
    if (sql.includes("from event_log")) return { rows: f.pending ? [{ id: "evento-pendente" }] : [] };
    return { rows: [] };
  });
});

describe("POST transcription", () => {
  it("rejeita id inválido sem tocar no banco", async () => {
    expect((await call("invalido")).status).toBe(422);
    expect(f.query).not.toHaveBeenCalled();
  });
  it("respeita o guard de papel e o suporte somente leitura", async () => {
    f.auth.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await call()).status).toBe(403);
    f.support.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await call()).status).toBe(403);
    expect(f.query).not.toHaveBeenCalled();
  });
  it("isola a consulta pela organização autenticada e não revela mensagem ausente", async () => {
    f.message = {};
    expect((await call()).status).toBe(404);
    expect(f.query.mock.calls.find(([sql]) => sql.includes("for update"))?.[1]).toEqual([id, orgId]);
    expect(f.audit).not.toHaveBeenCalled();
  });
  it.each([
    { is_personal: true }, { is_group: true }, { revoked_at: "2026-01-01" },
    { type: "image" }, { media_storage_path: null }, { metadata: { media_status: "expired" } },
    { media_storage_path: "outra-org/c1/audio.ogg" },
  ])("recusa mídia indisponível ou pessoal: %j", async (patch) => {
    Object.assign(f.message, patch);
    expect((await call()).status).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("emit_event"))).toBe(false);
  });
  it("enfileira uma única transcrição manual e audita sem texto ou segredo", async () => {
    expect((await call()).status).toBe(202);
    const evento = f.query.mock.calls.find(([sql]) => sql.includes("emit_event"));
    expect(evento?.[0]).toContain("transcricao_manual");
    expect(evento?.[1]).toEqual([id, orgId]);
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "message.transcription_requested", organizationId: orgId, resourceId: id,
    }));
    expect(f.release).toHaveBeenCalled();
  });
  it("pedido já em fila não cobra nem emite outro evento", async () => {
    f.pending = true;
    expect((await call()).status).toBe(202);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("emit_event"))).toBe(false);
    expect(f.audit).not.toHaveBeenCalled();
  });
  it("transcrição pronta é reutilizada", async () => {
    Object.assign(f.message, { media_derived_status: "ready", media_derived_text: "Olá" });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ status: "ready", text: "Olá" });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("emit_event"))).toBe(false);
  });
  it("falha ao enfileirar reverte a marca de processamento", async () => {
    f.query.mockImplementation(async (sql: string) => {
      if (sql.includes("for update")) return { rows: [f.message] };
      if (sql.includes("emit_event")) throw new Error("db unavailable");
      return { rows: [] };
    });
    expect((await call()).status).toBe(503);
    expect(f.query).toHaveBeenCalledWith("rollback");
    expect(f.audit).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalled();
  });
});
