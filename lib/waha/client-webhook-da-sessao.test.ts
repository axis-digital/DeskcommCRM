/**
 * WAHA COMPARTILHADO: engine aceito e webhook POR SESSÃO, configuráveis.
 *
 * O stack padrão sobe um WAHA só do CRM, NOWEB, com o webhook GLOBAL
 * (`WHATSAPP_HOOK_URL`) apontando para o app. Quem já roda um WAHA servindo
 * outros sistemas não pode fazer isso: o hook global entregaria ao CRM os
 * eventos de TODAS as sessões da casa, e trocar o engine default afetaria as
 * sessões alheias.
 *
 * Duas opções resolvem sem mudar o comportamento padrão:
 *  - `enginesAceitos`: a compatibilidade deixa de ser "NOWEB ou nada";
 *  - `webhookDaSessao`: a sessão nasce com o próprio bloco `webhooks`, então só
 *    os eventos dela chegam ao CRM.
 *
 * Sem as opções, o cliente segue byte a byte o contrato antigo — é o que o
 * primeiro bloco prende.
 */
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CONVERSAS_IGNORADAS, EVENTOS_DO_WEBHOOK, WahaClient, getWahaClient, type WahaClientOpts } from "./client";

type Step = { method: string; path: string; status: number; body?: unknown };
const name = "org-1";
const sessionPath = `/api/sessions/${name}`;
const config = { ignore: { status: true, broadcast: true, channels: true, groups: true } };
const session = (status = "STOPPED", engine = "NOWEB") => ({ name, status, config, engine: { engine } });

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let corpo = "";
    req.on("data", (c: Buffer) => (corpo += c.toString()));
    req.on("end", () => resolve(corpo));
  });
}

async function receive(steps: Step[], opts: WahaClientOpts, run: (client: WahaClient) => Promise<void>) {
  const corpos: unknown[] = [];
  const unexpected: string[] = [];
  const server = createServer(async (req, res) => {
    const corpo = await lerCorpo(req);
    if (req.method === "POST" && req.url === "/api/sessions") corpos.push(JSON.parse(corpo));
    const next = steps.shift();
    if (!next || next.method !== req.method || next.path !== req.url) {
      unexpected.push(`${req.method} ${req.url}`);
      res.writeHead(500).end();
      return;
    }
    res.writeHead(next.status, { "content-type": "application/json" });
    res.end(JSON.stringify(next.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(new WahaClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, "k", opts));
    expect(unexpected).toEqual([]);
    expect(steps).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return corpos;
}

const fluxo = (engine: string): Step[] => [
  { method: "POST", path: "/api/sessions", status: 201, body: session("STOPPED", engine) },
  { method: "GET", path: sessionPath, status: 200, body: session("STOPPED", engine) },
  { method: "POST", path: `${sessionPath}/start`, status: 201, body: session("STARTING", engine) },
  { method: "GET", path: sessionPath, status: 200, body: session("SCAN_QR_CODE", engine) },
];

describe("sem opções: contrato antigo intacto", () => {
  it("cria sem bloco webhooks", async () => {
    const corpos = await receive(fluxo("NOWEB"), {}, async (c) => {
      await expect(c.startSession(name)).resolves.toMatchObject({ status: "SCAN_QR_CODE" });
    });
    expect(corpos).toEqual([{ name, start: false, config: { ignore: CONVERSAS_IGNORADAS } }]);
  });

  it("recusa sessão GOWS", async () => {
    await receive(fluxo("GOWS").slice(0, 2), {}, async (c) => {
      await expect(c.startSession(name)).rejects.toThrow("waha_create_201");
    });
  });
});

describe("com opções: WAHA compartilhado", () => {
  const webhookDaSessao = { url: "http://app:3000/api/v1/webhooks/waha", hmacKey: "s".repeat(32) };

  it("aceita o engine configurado", async () => {
    await receive(fluxo("GOWS"), { enginesAceitos: ["NOWEB", "GOWS"] }, async (c) => {
      await expect(c.startSession(name)).resolves.toMatchObject({ status: "SCAN_QR_CODE" });
    });
  });

  it("cria a sessão com o próprio webhook, eventos do contrato e HMAC", async () => {
    const corpos = await receive(fluxo("NOWEB"), { webhookDaSessao }, async (c) => {
      await c.startSession(name);
    });
    expect(corpos).toEqual([
      {
        name,
        start: false,
        config: {
          ignore: CONVERSAS_IGNORADAS,
          webhooks: [{ url: webhookDaSessao.url, events: [...EVENTOS_DO_WEBHOOK], hmac: { key: webhookDaSessao.hmacKey } }],
        },
      },
    ]);
  });

  it("sem hmacKey, o webhook vai sem bloco hmac", async () => {
    const corpos = await receive(fluxo("NOWEB"), { webhookDaSessao: { url: webhookDaSessao.url } }, async (c) => {
      await c.startSession(name);
    });
    expect((corpos[0] as { config: { webhooks: unknown[] } }).config.webhooks).toEqual([
      { url: webhookDaSessao.url, events: [...EVENTOS_DO_WEBHOOK] },
    ]);
  });
});

describe("getWahaClient lê as opções do ambiente", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubBase() {
    vi.stubEnv("WAHA_API_BASE_URL", "http://wa-ha:3000");
    vi.stubEnv("WAHA_API_KEY", "real-key");
    vi.stubEnv("WAHA_WEBHOOK_BASE_URL", "http://crm-app:3000");
    vi.stubEnv("WAHA_HMAC_SECRET", "h".repeat(32));
  }

  it("default: só NOWEB, sem webhook por sessão", () => {
    stubBase();
    vi.stubEnv("WAHA_ACCEPTED_ENGINES", "");
    vi.stubEnv("WAHA_SESSION_WEBHOOK", "");
    expect(getWahaClient()?.opcoes()).toEqual({ enginesAceitos: ["NOWEB"], webhookDaSessao: null });
  });

  it("WAHA_ACCEPTED_ENGINES e WAHA_SESSION_WEBHOOK=true ligam o modo compartilhado", () => {
    stubBase();
    vi.stubEnv("WAHA_ACCEPTED_ENGINES", " noweb , GOWS ");
    vi.stubEnv("WAHA_SESSION_WEBHOOK", "true");
    expect(getWahaClient()?.opcoes()).toEqual({
      enginesAceitos: ["NOWEB", "GOWS"],
      webhookDaSessao: { url: "http://crm-app:3000/api/v1/webhooks/waha", hmacKey: "h".repeat(32) },
    });
  });
});
