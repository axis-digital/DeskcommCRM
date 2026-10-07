import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRow } from "@/lib/event-log/dispatcher";

const ORG = "11111111-1111-1111-1111-111111111111";
const LEAD = "22222222-2222-2222-2222-222222222222";
const CONTATO = "33333333-3333-3333-3333-333333333333";
const ETAPA = "44444444-4444-4444-8444-444444444444";
const FUNIL = "55555555-5555-4555-8555-555555555555";

const estado = {
  lead: { id: LEAD, status: "won", value_cents: 990000, currency: "brl", closed_at: new Date().toISOString(), contact_id: CONTATO, pipeline_id: FUNIL } as Record<string, unknown>,
  contato: { source_metadata: { ad_platform: "site", ga_client_id: "111.222", ga_session_id: "333" } } as Record<string, unknown>,
  etapa: { id: ETAPA, is_won: false, is_lost: false } as Record<string, unknown> | null,
  funil: { id: FUNIL, settings: {} } as Record<string, unknown> | null,
  registro: null as Record<string, unknown> | null,
};
const gravados: Record<string, unknown>[] = [];
const consultas: Array<{ tabela: string; filtros: Record<string, unknown> }> = [];

/** A linha só "existe" se casar com TODO filtro de flag pedido (is_won/is_lost). */
function casaFlags(linha: Record<string, unknown> | null, filtros: Record<string, unknown>) {
  if (!linha) return null;
  for (const flag of ["is_won", "is_lost"]) {
    if (flag in filtros && linha[flag] !== filtros[flag]) return null;
  }
  return linha;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filtros[c] = v), q),
        maybeSingle: async () => {
          consultas.push({ tabela, filtros: { ...filtros } });
          if (filtros.organization_id !== ORG) return { data: null, error: null };
          if (tabela === "crm_leads") return { data: estado.lead, error: null };
          if (tabela === "contacts") return { data: estado.contato, error: null };
          if (tabela === "crm_stages") return { data: casaFlags(estado.etapa, filtros), error: null };
          if (tabela === "crm_pipelines") {
            return { data: estado.funil && filtros.id === estado.funil.id ? estado.funil : null, error: null };
          }
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
import { lerRegraGa4DaEtapa } from "@/lib/conversoes/regras-ga4";
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
  consultas.length = 0;
  estado.lead = { ...estado.lead, status: "won", pipeline_id: FUNIL };
  estado.etapa = { id: ETAPA, is_won: false, is_lost: false };
  estado.funil = { id: FUNIL, settings: {} };
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

  it("close_convert_lead não leva transaction_id", async () => {
    await conversaoGa4Handler.handle(linha("lead.won"));
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({ transactionId: null });
  });

  it("com purchase escolhido, o ganho leva transaction_id = id do lead, valor e moeda", async () => {
    vi.mocked(lerCredencialGa4).mockResolvedValueOnce({
      ok: true,
      credencial: { measurementId: "G-ABC123", apiSecret: "s", wonEvent: "purchase" },
    });
    await conversaoGa4Handler.handle(linha("lead.won"));
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({
      nome: "purchase",
      transactionId: LEAD,
      valorCentavos: 990000,
      moeda: "brl",
    });
    expect(gravados[0]).toMatchObject({ evento: "GA4:Venda", ga4EventName: "purchase" });
  });

  it("reenvio de venda gravada como purchase repete o retrato com transaction_id", async () => {
    estado.registro = {
      status: "error",
      event_occurred_at: new Date().toISOString(),
      ga4_event_name: "purchase",
    };
    await conversaoGa4Handler.handle(
      linha("ad_conversion.retry_requested", { event_name: "GA4:Venda" }),
    );
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({
      nome: "purchase",
      transactionId: LEAD,
      valorCentavos: 990000,
    });
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

function credencialCom(wonEvent: "close_convert_lead" | "purchase") {
  vi.mocked(lerCredencialGa4).mockResolvedValueOnce({
    ok: true,
    credencial: { measurementId: "G-ABC123", apiSecret: "s", wonEvent },
  });
}

describe("consumidor GA4: a venda segue o objetivo do funil do negócio", () => {
  it("funil de vender produto envia purchase com transaction_id, mesmo com a conexão em close_convert_lead", async () => {
    estado.funil = { id: FUNIL, settings: { objetivo: "vender_produto", outra_chave: 1 } };
    credencialCom("close_convert_lead");
    await conversaoGa4Handler.handle(linha("lead.won"));
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({
      nome: "purchase",
      transactionId: LEAD,
      valorCentavos: 990000,
      moeda: "brl",
    });
    expect(gravados[0]).toMatchObject({ evento: "GA4:Venda", ga4EventName: "purchase" });
  });

  it("funil de vender serviço envia close_convert_lead sem transaction_id, mesmo com a conexão em purchase", async () => {
    estado.funil = { id: FUNIL, settings: { objetivo: "vender_servico" } };
    credencialCom("purchase");
    await conversaoGa4Handler.handle(linha("lead.won"));
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({
      nome: "close_convert_lead",
      transactionId: null,
      valorCentavos: 990000,
    });
    expect(gravados[0]).toMatchObject({ ga4EventName: "close_convert_lead" });
  });

  it("funil sem objetivo usa o padrão da conexão", async () => {
    estado.funil = { id: FUNIL, settings: { objetivo: "nao_existe" } };
    credencialCom("purchase");
    await conversaoGa4Handler.handle(linha("lead.won"));
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({ nome: "purchase", transactionId: LEAD });
  });

  it("negócio sem funil usa o padrão da conexão", async () => {
    estado.lead = { ...estado.lead, pipeline_id: null };
    await conversaoGa4Handler.handle(linha("lead.won"));
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({ nome: "close_convert_lead" });
  });

  it("o funil é lido filtrando a organização do evento e o funil do negócio", async () => {
    estado.funil = { id: FUNIL, settings: { objetivo: "vender_produto" } };
    await conversaoGa4Handler.handle(linha("lead.won"));
    const doFunil = consultas.filter((c) => c.tabela === "crm_pipelines");
    expect(doFunil).toHaveLength(1);
    expect(doFunil[0]!.filtros).toMatchObject({ organization_id: ORG, id: FUNIL });
  });

  it("reenvio repete o retrato gravado, não o objetivo de agora", async () => {
    estado.funil = { id: FUNIL, settings: { objetivo: "vender_produto" } };
    estado.registro = {
      status: "error",
      event_occurred_at: new Date().toISOString(),
      ga4_event_name: "close_convert_lead",
    };
    await conversaoGa4Handler.handle(linha("ad_conversion.retry_requested", { event_name: "GA4:Venda" }));
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({
      nome: "close_convert_lead",
      transactionId: null,
    });
    expect(consultas.some((c) => c.tabela === "crm_pipelines")).toBe(false);
  });

  it("falha ao ler o funil pede nova tentativa em vez de mandar o evento errado", async () => {
    estado.funil = { id: FUNIL, settings: { objetivo: "vender_produto" } };
    const original = estado.funil;
    Object.defineProperty(estado, "funil", {
      configurable: true,
      get() {
        throw new Error("rede");
      },
    });
    try {
      const r = await conversaoGa4Handler.handle(linha("lead.won"));
      expect(r.status).toBe("retry");
      expect(enviarEventoGa4).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(estado, "funil", { configurable: true, writable: true, enumerable: true, value: original });
    }
  });
});

describe("consumidor GA4: etapa de perda", () => {
  it("regra numa etapa perdida dispara close_unconvert_lead ao entrar nela", async () => {
    estado.lead = { ...estado.lead, status: "lost" };
    estado.etapa = { id: ETAPA, is_won: false, is_lost: true };
    vi.mocked(lerRegraGa4DaEtapa).mockResolvedValueOnce({
      id: "r2", stageId: ETAPA, eventName: `GA4Etapa:${ETAPA}`, ga4Event: "close_unconvert_lead", enabled: true, configuredAt: "2000-01-01T00:00:00Z",
    });
    const r = await conversaoGa4Handler.handle(linha("lead.stage_changed", { to_stage_id: ETAPA }));
    expect(r).toMatchObject({ status: "ok" });
    expect(vi.mocked(enviarEventoGa4).mock.calls[0]![1]).toMatchObject({
      nome: "close_unconvert_lead",
      valorCentavos: null,
      transactionId: null,
    });
    expect(gravados[0]).toMatchObject({ evento: `GA4Etapa:${ETAPA}`, ga4EventName: "close_unconvert_lead" });
  });

  it("etapa de ganho com regra continua fora: a venda tem caminho próprio", async () => {
    estado.lead = { ...estado.lead, status: "open" };
    estado.etapa = { id: ETAPA, is_won: true, is_lost: false };
    const r = await conversaoGa4Handler.handle(linha("lead.stage_changed", { to_stage_id: ETAPA }));
    expect(r).toMatchObject({ status: "skipped", detail: "etapa_invalida" });
    expect(enviarEventoGa4).not.toHaveBeenCalled();
  });
});
