import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarClickRef } from "@/lib/plataformas-de-anuncio/google/captura-de-clique";

/**
 * A identidade GA4 do clique (migration 9002) viaja na query da landing e tem de
 * chegar até `google_ads_click_refs.query_raw`: é dali que o casamento com o
 * contato a lê (`casarClickRef`) para reportar o ganho à MESMA sessão do site.
 *
 * O sync de 16/11 trouxe da upstream a normalização de `query_raw` na criação (só
 * chaves de campanha passam). Ela descartava `ga_client_id` e `ga_session_id`, e o
 * e2e `conversoes-ga4` ficou vermelho: o contato nascia com `ad_raw.token` e o
 * `gclid`, sem o bloco `ga`.
 */
const mock = vi.hoisted(() => ({ gravar: vi.fn() }));
vi.mock("@/lib/plataformas-de-anuncio/captura-de-clique", () => ({
  criarClickRef: mock.gravar,
}));

const GCLID = "e2e-ga4-3655772c-c1c6-41ec-a2fd-32827991f05c";
const CLIENT_ID = "123456789.1700000000";
const SESSION_ID = "1700000001";
// O cliente do Supabase nunca é tocado: a gravação é a função mockada acima.
const admin = {} as never;

async function queryRawGravada(queryRaw: Record<string, string>): Promise<Record<string, unknown>> {
  await criarClickRef(admin, "org-1", { gclid: GCLID }, queryRaw);
  const [, , , linha] = mock.gravar.mock.calls[0] as [unknown, unknown, unknown, { query_raw: Record<string, unknown> }];
  return linha.query_raw;
}

describe("criarClickRef (Google): a identidade GA4 atravessa a normalização", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.gravar.mockResolvedValue({ token: "2ABCDE" });
  });

  it("guarda ga_client_id e ga_session_id válidos junto do gclid e da campanha", async () => {
    const raw = await queryRawGravada({
      utm_source: "google",
      ga_client_id: CLIENT_ID,
      ga_session_id: SESSION_ID,
    });

    expect(raw).toMatchObject({
      utm_source: "google",
      gclid: GCLID,
      ga_client_id: CLIENT_ID,
      ga_session_id: SESSION_ID,
    });
  });

  it("guarda só o client_id quando a sessão não veio", async () => {
    const raw = await queryRawGravada({ ga_client_id: CLIENT_ID });

    expect(raw.ga_client_id).toBe(CLIENT_ID);
    expect(raw).not.toHaveProperty("ga_session_id");
  });

  it("descarta identidade fora do formato do cookie _ga (não grava lixo)", async () => {
    const raw = await queryRawGravada({ ga_client_id: "não é um client id", ga_session_id: SESSION_ID });

    expect(raw).not.toHaveProperty("ga_client_id");
    expect(raw).not.toHaveProperty("ga_session_id");
  });

  it("sem identidade GA4 na query, nada de ga_* na gravação", async () => {
    const raw = await queryRawGravada({ utm_source: "google" });

    expect(raw).not.toHaveProperty("ga_client_id");
    expect(raw).not.toHaveProperty("ga_session_id");
  });

  it("CONTROLE: a proteção da upstream segue de pé — chave arbitrária da query não atravessa", async () => {
    const raw = await queryRawGravada({ utm_source: "google", qualquer_coisa: "x", ga_client_id: CLIENT_ID });

    expect(raw).not.toHaveProperty("qualquer_coisa");
    expect(raw).toHaveProperty("utm_source", "google");
  });
});
