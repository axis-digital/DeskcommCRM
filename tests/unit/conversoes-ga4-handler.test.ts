import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRow } from "@/lib/event-log/dispatcher";

const ORG = "11111111-1111-1111-1111-111111111111";
const LEAD = "22222222-2222-2222-2222-222222222222";
const CONTATO = "33333333-3333-3333-3333-333333333333";
const ETAPA = "44444444-4444-4444-8444-444444444444";

const estado = {
  lead: { id: LEAD, status: "won", value_cents: 990000, currency: "brl", closed_at: new Date().toISOString(), contact_id: CONTATO } as Record<string, unknown>,
  contato: { source_metadata: { ad_platform: "site", ga_client_id: "111.222", ga_session_id: "333" } } as Record<string, unknown>,
  etapa: { id: ETAPA } as Record<string, unknown> | null,
  registro: null as Record<string, unknown> | null,
};
const gravados: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filtros[c] = v), q),
        maybeSingle: async () => {
          if (filtros.organization_id !== ORG) return { data: null, error: null };
          if (tabela === "crm_leads") return { data: estado.lead, error: null };
          if (tabela === "contacts") return { data: estado.contato, error: null };
          if (tabela === "crm_stages") return { data: estado.etapa, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/conversoes/registro-de-envio", () => ({
  lerRegistro: vi.fn(async () => estado.registro),
  registraEnvio: vi.fn(async (_a: unknown, r: Record<string, unknown>) => void gravados.push(r)),
}));
vi.mock("@/lib/plataformas-de-anuncio/ga4/credencial", () => ({
  lerCredencialGa4: vi.fn(async () => ({
    ok: true,
    credencial: { measurementId: "G-ABC123", apiSecret: "s", wonEvent: "close_convert_lead" },
  })),
}));
vi.mock("@/lib/plataformas-de-anuncio/ga4/measurement-protocol", () => ({
  enviarEventoGa4: vi.fn(async () => ({ tipo: "ok", detalhe: "aceito" })),
}));
vi.mock("@/lib/conversoes/regras-ga4", async (orig) => ({
  ...(await orig<typeof import("@/lib/conversoes/regras-ga4")>()),
  lerRegraGa4DaEtapa: vi.fn(async () => ({
    id: "r1", stageId: ETAPA, eventName: `GA4Etapa:${ETAPA}`, ga4Event: "qualify_lead", enabled: true, configuredAt: "2000-01-01T00:00:00Z",
  })),
}));

import { conversaoGa4Handler } from "@/lib/conversoes/ga4.handler";
import { lerCredencialGa4 } from "@/lib/plataformas-de-anuncio/ga4/credencial";
import { enviarEventoGa4 } from "@/lib/plataformas-de-anuncio/ga4/measurement-protocol";

function linha(event_type: string, payload: Record<string, unknown> = {}): EventRow {
  return {
    id: "e1", organization_id: ORG, event_type, entity_kind: "lead", entity_id: LEAD,
    payload, metadata: {}, consumed_by: [], attempts: 0, created_at: new Date().toISOString(),
  } as EventRow;
}

beforeEach(() => {
  gravados.length = 0;
  estado.lead = { ...estado.lead, status: "won" };
  estado.contato = { source_metadata: { ad_platform: "site", ga_client_id: "111.222", ga_session_id: "333" } };
  estado.registro = null;
  vi.mocked(enviarEventoGa4).mockClear();
});

describe("consumidor GA4", () => {
  it("ganho envia o evento de venda escolhido com valor e grava no livro-razão", async () => {
    const r = await conversaoGa4Handler.handle(linha("lead.won"));
    expect(r.status).not.toBe("retry");
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({
      nome: "close_convert_lead",
      identidade: { clientId: "111.222", sessionId: "333" },
      valorCentavos: 990000,
      moeda: "brl",
    });
    expect(gravados[0]).toMatchObject({ plataforma: "ga4", evento: "GA4:Venda", status: "sent", ga4EventName: "close_convert_lead" });
  });

  it("etapa com regra envia o evento da regra sem valor", async () => {
    estado.lead = { ...estado.lead, status: "open" };
    await conversaoGa4Handler.handle(linha("lead.stage_changed", { to_stage_id: ETAPA }));
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({ nome: "qualify_lead", valorCentavos: null });
    expect(gravados[0]).toMatchObject({ evento: `GA4Etapa:${ETAPA}` });
  });

  it("já enviada não sai de novo", async () => {
    estado.registro = { status: "sent" };
    const r = await conversaoGa4Handler.handle(linha("lead.won"));
    expect(r).toMatchObject({ status: "skipped", detail: "ja_enviada" });
    expect(enviarEventoGa4).not.toHaveBeenCalled();
  });

  it("contato sem client_id (ex.: primeiro toque foi clique-para-WhatsApp) não envia nem grava", async () => {
    estado.contato = { source_metadata: { ad_platform: "meta_ads", ad_source_id: "ctwa-1" } };
    const r = await conversaoGa4Handler.handle(linha("lead.won"));
    expect(r).toMatchObject({ status: "skipped", detail: "sem_identidade_ga4" });
    expect(gravados).toHaveLength(0);
  });

  it("sem conexão GA4 não envia nem grava", async () => {
    vi.mocked(lerCredencialGa4).mockResolvedValueOnce({ ok: false, motivo: "sem_conexao" });
    const r = await conversaoGa4Handler.handle(linha("lead.won"));
    expect(r).toMatchObject({ status: "skipped", detail: "sem_conexao" });
    expect(gravados).toHaveLength(0);
  });

  it("transitório grava erro e pede nova tentativa", async () => {
    vi.mocked(enviarEventoGa4).mockResolvedValueOnce({ tipo: "transitorio", detalhe: "503" });
    const r = await conversaoGa4Handler.handle(linha("lead.won"));
    expect(r.status).toBe("retry");
    expect(gravados[0]).toMatchObject({ status: "error", motivo: "transitorio" });
  });

  it("reenvio de evento de outra plataforma é ignorado", async () => {
    const r = await conversaoGa4Handler.handle(linha("ad_conversion.retry_requested", { event_name: "Purchase" }));
    expect(r).toMatchObject({ status: "skipped", detail: "outro_evento" });
  });
});
