/**
 * O transporte do Google sem clique (fallback sem origem): o e-mail e o telefone
 * saem em hash, e a venda sem nenhum dos dois é recusada antes da rede.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/plataformas-de-anuncio/google/config", () => ({
  configuracaoDoGoogleAds: () => ({
    clientId: "c",
    clientSecret: "s",
    developerToken: "dev",
    redirectUri: "https://x/cb",
  }),
}));
vi.mock("@/lib/plataformas-de-anuncio/google/token", () => ({
  renovarToken: vi.fn(async () => ({ ok: true, token: { access_token: "tok" } })),
}));

import { transporteGoogle } from "@/lib/plataformas-de-anuncio/google/conversions";
import { hashNormalizado } from "@/lib/plataformas-de-anuncio/hash";
import type { ConversaoOffline, CredencialDeConversao } from "@/lib/plataformas-de-anuncio/types";

const credencial: CredencialDeConversao = {
  google: {
    customerId: "123-456-7890",
    refreshToken: "r",
    conversionActionId: "999",
    enviarTelefone: true,
  },
} as unknown as CredencialDeConversao;

const base: ConversaoOffline = {
  organizationId: "11111111-1111-1111-1111-111111111111",
  leadId: "22222222-2222-2222-2222-222222222222",
  evento: "Purchase",
  eventoId: "22222222-2222-2222-2222-222222222222:Purchase",
  ocorridoEm: new Date("2026-10-06T12:00:00Z"),
  cliqueDeOrigem: "",
  telefone: "5511999998888",
  moeda: "BRL",
  valorCentavos: 15000,
  eventoNaPlataforma: null,
} as ConversaoOffline;

let corpoEnviado: { conversions: Record<string, unknown>[] } | null = null;

beforeEach(() => {
  corpoEnviado = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      corpoEnviado = JSON.parse(init.body);
      return new Response(JSON.stringify({ results: [{}] }), { status: 200 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Google sem clique: identificadores em hash", () => {
  it("manda o e-mail em SHA-256 normalizado quando não há clique", async () => {
    await transporteGoogle.enviar(credencial, { ...base, emailDoContato: "  Maria@Exemplo.com " });
    const conversao = corpoEnviado!.conversions[0]!;
    expect(conversao.userIdentifiers).toEqual(
      expect.arrayContaining([{ hashedEmail: hashNormalizado("maria@exemplo.com") }]),
    );
    expect(conversao.gclid).toBeUndefined();
  });

  it("sem clique, sem e-mail e sem telefone: recusa antes de falar com o Google", async () => {
    const r = await transporteGoogle.enviar(credencial, { ...base, telefone: null });
    expect(r.tipo).toBe("permanente");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("com clique (gclid), o e-mail não entra no userIdentifiers: o gclid é a identidade", async () => {
    await transporteGoogle.enviar(credencial, {
      ...base,
      cliqueDeOrigem: "Cj0KCQ_gclid",
      emailDoContato: "maria@exemplo.com",
    });
    const conversao = corpoEnviado!.conversions[0]!;
    expect(conversao.gclid).toBe("Cj0KCQ_gclid");
    const hashes = (conversao.userIdentifiers as { hashedEmail?: string }[] | undefined) ?? [];
    expect(hashes.some((h) => h.hashedEmail)).toBe(false);
  });
});
