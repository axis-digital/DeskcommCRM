import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enviarEventoGa4,
  IDADE_MAXIMA_GA4_MS,
  validarNoGa4,
  type CredencialGa4,
  type EventoGa4,
} from "@/lib/plataformas-de-anuncio/ga4/measurement-protocol";

const CRED: CredencialGa4 = {
  measurementId: "G-ABC123",
  apiSecret: "segredo-xyz",
  wonEvent: "close_convert_lead",
};
const agora = new Date("2026-10-05T12:00:00Z");
const EVENTO: EventoGa4 = {
  nome: "close_convert_lead",
  identidade: { clientId: "111.222", sessionId: "333" },
  ocorridoEm: new Date(agora.getTime() - 3600_000),
  valorCentavos: 150000,
  moeda: "brl",
  transactionId: null,
};

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers({ now: agora });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  delete process.env.GA4_MP_BASE_URL;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Measurement Protocol", () => {
  it("monta o corpo certo e trata 2xx como aceito", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const r = await enviarEventoGa4(CRED, EVENTO);
    expect(r.tipo).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe("https://www.google-analytics.com/mp/collect");
    expect(u.searchParams.get("measurement_id")).toBe("G-ABC123");
    expect(u.searchParams.get("api_secret")).toBe("segredo-xyz");
    const corpo = JSON.parse((init as RequestInit).body as string);
    expect(corpo).toEqual({
      client_id: "111.222",
      timestamp_micros: (agora.getTime() - 3600_000) * 1000,
      non_personalized_ads: false,
      events: [
        {
          name: "close_convert_lead",
          params: { session_id: "333", engagement_time_msec: 1, value: 1500, currency: "BRL" },
        },
      ],
    });
  });

  it("sem valor não manda value nem currency (nunca 0)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await enviarEventoGa4(CRED, {
      ...EVENTO,
      valorCentavos: null,
      moeda: null,
      identidade: { clientId: "1.2", sessionId: null },
    });
    const corpo = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(corpo.events[0].params).toEqual({ engagement_time_msec: 1 });
  });

  it("purchase leva transaction_id", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await enviarEventoGa4(CRED, { ...EVENTO, nome: "purchase", transactionId: "lead-uuid" });
    const corpo = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(corpo.events[0].params.transaction_id).toBe("lead-uuid");
  });

  it("evento com mais de 72h é recusa permanente sem chamar a rede", async () => {
    const r = await enviarEventoGa4(CRED, {
      ...EVENTO,
      ocorridoEm: new Date(agora.getTime() - IDADE_MAXIMA_GA4_MS - 1),
    });
    expect(r.tipo).toBe("permanente");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("5xx e falha de rede são transitórios; 4xx é permanente", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 503 }));
    expect((await enviarEventoGa4(CRED, EVENTO)).tipo).toBe("transitorio");
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect((await enviarEventoGa4(CRED, EVENTO)).tipo).toBe("transitorio");
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 400 }));
    expect((await enviarEventoGa4(CRED, EVENTO)).tipo).toBe("permanente");
  });

  it("o detalhe de erro nunca contém o api_secret", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("falhou https://www.google-analytics.com/mp/collect?api_secret=segredo-xyz"),
    );
    const r = await enviarEventoGa4(CRED, EVENTO);
    expect(JSON.stringify(r)).not.toContain("segredo-xyz");
  });

  it("GA4_MP_BASE_URL aponta para o receptor de prova", async () => {
    process.env.GA4_MP_BASE_URL = "http://localhost:4599";
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await enviarEventoGa4(CRED, EVENTO);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/^http:\/\/localhost:4599\/mp\/collect\?/);
  });

  it("validação usa /debug/mp/collect e devolve as mensagens", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        validationMessages: [{ description: "Invalid client_id", fieldPath: "client_id" }],
      }),
    );
    const r = await validarNoGa4(CRED, EVENTO);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/debug/mp/collect?");
    expect(r).toEqual({ ok: false, mensagens: ["client_id: Invalid client_id"] });
  });
});
