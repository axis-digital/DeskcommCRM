// @vitest-environment node
/**
 * /api/v1/aviso-organizacao — o handler real, com o banco e a sessão simulados.
 *
 * O que estes casos vigiam:
 * - desligar GRAVA `enabled: false` e preserva janelas, texto e fuso (ligar de novo não
 *   obriga a redigitar);
 * - o merge preserva as demais chaves de `organizations.settings`;
 * - a organização vem da sessão, nunca do corpo;
 * - ligar sem o contrato completo é 422 e não escreve nada;
 * - guarda de suporte e de papel vêm antes de qualquer efeito.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  guard: vi.fn(),
  apoio: vi.fn(),
  audit: vi.fn(),
  leitura: vi.fn(),
  gravacao: vi.fn(),
  eqLeitura: vi.fn(),
  eqGravacao: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.guard }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: h.apoio }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => {
          h.eqLeitura(...args);
          return { maybeSingle: h.leitura };
        },
      }),
      update: (valores: unknown) => ({
        eq: (...args: unknown[]) => {
          h.eqGravacao(...args);
          return h.gravacao(valores);
        },
      }),
    }),
  }),
}));

import { GET, PATCH } from "@/app/api/v1/aviso-organizacao/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";

const blocoValido = {
  enabled: true,
  timezone: "America/Sao_Paulo",
  windows: [{ dow: 1, start: "09:00", end: "18:00" }],
  notice: "Voltamos amanhã às 9h.",
};

function pedido(corpo: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/aviso-organizacao", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.guard.mockResolvedValue({ ok: true, user: { id: "user-1", idioma: "pt-BR" }, org: { orgId: ORG } });
  h.apoio.mockResolvedValue(null);
  h.audit.mockResolvedValue(undefined);
  h.leitura.mockResolvedValue({ data: { settings: { campanhas_whatsapp: true, aviso_fora_do_horario: blocoValido } }, error: null });
  h.gravacao.mockResolvedValue({ error: null });
});

function gravado(): Record<string, unknown> {
  return (h.gravacao.mock.calls[0]![0] as { settings: Record<string, unknown> }).settings;
}

describe("GET /api/v1/aviso-organizacao", () => {
  it("devolve a resposta do guarda quando o papel não basta e não lê o banco", async () => {
    const negado = new Response(null, { status: 403 });
    h.guard.mockResolvedValue({ ok: false, response: negado });
    const res = await GET();
    expect(res).toBe(negado);
    expect(h.leitura).not.toHaveBeenCalled();
  });

  it("lê o bloco do aviso da organização da sessão", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { configuracao: unknown } };
    expect(corpo.data.configuracao).toEqual(blocoValido);
    expect(h.eqLeitura).toHaveBeenCalledWith("id", ORG);
  });

  it("devolve configuracao nula quando o bloco não existe ou é inválido", async () => {
    h.leitura.mockResolvedValue({ data: { settings: { aviso_fora_do_horario: { enabled: true } } }, error: null });
    const res = await GET();
    const corpo = (await res.json()) as { data: { configuracao: unknown } };
    expect(corpo.data.configuracao).toBeNull();
  });
});

describe("PATCH /api/v1/aviso-organizacao", () => {
  it("não escreve quando a guarda de suporte nega", async () => {
    const negado = new Response(null, { status: 403 });
    h.apoio.mockResolvedValue(negado);
    const res = await PATCH(pedido(blocoValido));
    expect(res).toBe(negado);
    expect(h.gravacao).not.toHaveBeenCalled();
  });

  it("exige admin (o mesmo gate da rota irmã de settings/atendimento)", async () => {
    await PATCH(pedido(blocoValido));
    expect(h.guard).toHaveBeenCalledWith("admin", expect.objectContaining({ resource: "aviso_organizacao" }));
  });

  it("recusa com 422, sem escrever, quando ligar sem o contrato completo", async () => {
    const res = await PATCH(pedido({ enabled: true, timezone: "America/Sao_Paulo", windows: [], notice: "x" }));
    expect(res.status).toBe(422);
    expect(h.gravacao).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("recusa com 422 quando enabled não é booleano", async () => {
    const res = await PATCH(pedido({ enabled: "sim" }));
    expect(res.status).toBe(422);
    expect(h.gravacao).not.toHaveBeenCalled();
  });

  it("DESLIGAR grava enabled:false e preserva janelas, texto e fuso", async () => {
    const res = await PATCH(pedido({ enabled: false }));
    expect(res.status).toBe(200);
    const bloco = gravado().aviso_fora_do_horario as Record<string, unknown>;
    expect(bloco.enabled).toBe(false);
    expect(bloco.windows).toEqual(blocoValido.windows);
    expect(bloco.notice).toBe(blocoValido.notice);
    expect(bloco.timezone).toBe(blocoValido.timezone);
  });

  it("desligar sem bloco anterior grava só enabled:false", async () => {
    h.leitura.mockResolvedValue({ data: { settings: {} }, error: null });
    const res = await PATCH(pedido({ enabled: false }));
    expect(res.status).toBe(200);
    expect(gravado().aviso_fora_do_horario).toEqual({ enabled: false });
  });

  it("ligar grava o bloco novo e PRESERVA as demais chaves de settings", async () => {
    const novo = { ...blocoValido, notice: "Texto novo" };
    const res = await PATCH(pedido(novo));
    expect(res.status).toBe(200);
    const settings = gravado();
    expect(settings.campanhas_whatsapp).toBe(true);
    expect(settings.aviso_fora_do_horario).toEqual(novo);
  });

  it("filtra a leitura e a escrita pela organização da SESSÃO, nunca pelo corpo", async () => {
    await PATCH(pedido({ ...blocoValido, organization_id: OUTRA_ORG, org_id: OUTRA_ORG }));
    expect(h.eqLeitura).toHaveBeenCalledWith("id", ORG);
    expect(h.eqGravacao).toHaveBeenCalledWith("id", ORG);
    expect(h.eqGravacao).not.toHaveBeenCalledWith("id", OUTRA_ORG);
    expect(JSON.stringify(gravado())).not.toContain(OUTRA_ORG);
  });

  it("audita uma vez, com a action própria e a organização da sessão", async () => {
    await PATCH(pedido(blocoValido));
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.aviso_fora_do_horario_alterada",
        organizationId: ORG,
        actorUserId: "user-1",
      }),
    );
  });

  it("não vaza a mensagem do banco quando a gravação falha", async () => {
    h.gravacao.mockResolvedValue({ error: { message: "duplicate key value violates constraint secreta" } });
    const res = await PATCH(pedido(blocoValido));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secreta");
    expect(h.audit).not.toHaveBeenCalled();
  });
});
