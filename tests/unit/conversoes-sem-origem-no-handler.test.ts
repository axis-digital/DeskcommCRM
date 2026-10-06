/**
 * A fiação do fallback sem origem no handler da venda: sem o opt-in nada muda;
 * com ele, a venda sem atribuição vai ao fallback; e a venda que já saiu sem
 * origem não é contada de novo quando a atribuição aparece depois.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";

const ORG = "11111111-1111-1111-1111-111111111111";
const LEAD = "22222222-2222-2222-2222-222222222222";
const CONTATO = "33333333-3333-3333-3333-333333333333";

const estado = vi.hoisted(() => ({
  contato: null as Record<string, unknown> | null,
  settings: {} as Record<string, unknown>,
  registros: {} as Record<string, Record<string, unknown>>,
  reportar: vi.fn(async () => [{ plataforma: "meta_ads", status: "sent", motivo: null }]),
  enviar: vi.fn(async () => ({ tipo: "ok" })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filtros[c] = v), q),
        maybeSingle: async () => {
          if (tabela === "crm_leads")
            return {
              data: {
                id: LEAD,
                status: "won",
                value_cents: 15000,
                currency: "BRL",
                closed_at: new Date().toISOString(),
                contact_id: CONTATO,
              },
              error: null,
            };
          if (tabela === "contacts") return { data: estado.contato, error: null };
          if (tabela === "organizations")
            return { data: { settings: estado.settings }, error: null };
          if (tabela === "ad_conversion_dispatches")
            return { data: estado.registros[String(filtros.event_name)] ?? null, error: null };
          return { data: null, error: null };
        },
        upsert: async () => ({ error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/conversoes/reportar-sem-origem", async (orig) => ({
  ...(await orig<typeof import("@/lib/conversoes/reportar-sem-origem")>()),
  reportarVendaSemOrigem: estado.reportar,
}));
vi.mock("@/lib/plataformas-de-anuncio/credenciais", () => ({
  lerCredencial: vi.fn(async () => ({ ok: true, credencial: {} })),
}));
vi.mock("@/lib/plataformas-de-anuncio/registry", async (orig) => ({
  ...(await orig<typeof import("@/lib/plataformas-de-anuncio/registry")>()),
  transporteDe: () => ({ enviar: estado.enviar }),
}));

import { conversaoDeVendaHandler } from "@/lib/conversoes/envio.handler";

function ganho(): EventRow {
  return {
    id: "evt",
    organization_id: ORG,
    event_type: "lead.won",
    entity_kind: "crm_lead",
    entity_id: LEAD,
    payload: {},
    created_at: new Date().toISOString(),
  } as EventRow;
}

const organico = { phone_number: "5511999998888", email: "maria@exemplo.com", source_metadata: {} };

describe("fallback sem origem no handler da venda", () => {
  beforeEach(() => {
    estado.contato = organico;
    estado.settings = {};
    estado.registros = {};
    estado.reportar.mockClear();
    estado.enviar.mockClear();
  });

  it("sem o opt-in, a venda orgânica segue como sempre: sem envio e sem fallback", async () => {
    const r = await conversaoDeVendaHandler.handle(ganho());
    expect(r).toMatchObject({ status: "skipped", detail: "sem_atribuicao" });
    expect(estado.reportar).not.toHaveBeenCalled();
  });

  it("com o opt-in, a venda sem atribuição vai ao fallback com telefone e e-mail do contato", async () => {
    estado.settings = { conversions: { enviar_sem_origem: true } };
    const r = await conversaoDeVendaHandler.handle(ganho());
    expect(r.status).toBe("ok");
    expect(estado.reportar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        leadId: LEAD,
        telefone: "5511999998888",
        email: "maria@exemplo.com",
        valorCentavos: 15000,
      }),
    );
  });

  it("a venda que já saiu sem origem não sai de novo quando a atribuição aparece depois", async () => {
    estado.contato = {
      phone_number: "5511999998888",
      source_metadata: { ad_platform: "meta_ads", ad_source_id: "CLIQUE" },
    };
    estado.registros["SemOrigem:meta_ads:Purchase"] = { status: "sent", platform: "meta_ads" };
    const r = await conversaoDeVendaHandler.handle(ganho());
    expect(r).toMatchObject({ status: "skipped", detail: "ja_enviada_sem_origem" });
    expect(estado.enviar).not.toHaveBeenCalled();
  });

  it("o reenvio pedido para a venda sem origem volta ao fallback", async () => {
    estado.settings = { conversions: { enviar_sem_origem: true } };
    estado.registros["SemOrigem:meta_ads:Purchase"] = { status: "error", platform: "meta_ads" };
    const r = await conversaoDeVendaHandler.handle(reenvio("SemOrigem:meta_ads:Purchase"));
    expect(r.status).toBe("ok");
    expect(estado.reportar).toHaveBeenCalledOnce();
  });

  it.each(["GA4:Venda", "GA4Etapa:44444444-4444-4444-8444-444444444444"])(
    "o reenvio de %s é do consumidor do GA4: a venda não é reprocessada aqui",
    async (evento) => {
      estado.settings = { conversions: { enviar_sem_origem: true } };
      const r = await conversaoDeVendaHandler.handle(reenvio(evento));
      expect(r).toMatchObject({ status: "skipped", detail: "outro_evento" });
      expect(estado.reportar).not.toHaveBeenCalled();
      expect(estado.enviar).not.toHaveBeenCalled();
    },
  );
});

function reenvio(evento: string): EventRow {
  return {
    ...ganho(),
    event_type: "ad_conversion.retry_requested",
    payload: { event_name: evento },
  };
}
