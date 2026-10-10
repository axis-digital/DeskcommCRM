/**
 * WAHA COMPARTILHADO: proxy POR SESSÃO, configurável.
 *
 * Num WAHA que serve vários sistemas o proxy não pode ser global — cada número
 * sai pelo IP que já usava (anti-banimento). O WAHA aceita `config.proxy` na
 * criação da sessão; `proxyDaSessao` faz toda sessão criada pelo CRM nascer
 * com ele. Sem a opção, o corpo de criação segue o contrato antigo (preso em
 * `client-webhook-da-sessao.test.ts`).
 *
 * A senha do proxy é segredo: entra no corpo enviado ao WAHA e em nenhum outro
 * lugar — `opcoes()` mostra só o servidor.
 */
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONVERSAS_IGNORADAS,
  EVENTOS_DO_WEBHOOK,
  WahaClient,
  getWahaClient,
  lerProxyDaSessao,
  type WahaClientOpts,
} from "./client";

type Step = { method: string; path: string; status: number; body?: unknown };
const name = "org-1";
const sessionPath = `/api/sessions/${name}`;
const config = { ignore: { status: true, broadcast: true, channels: true, groups: true } };
const session = (status = "STOPPED") => ({ name, status, config, engine: { engine: "NOWEB" } });

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let corpo = "";
    req.on("data", (c: Buffer) => (corpo += c.toString()));
    req.on("end", () => resolve(corpo));
  });
}

async function corposDeCriacao(opts: WahaClientOpts): Promise<unknown[]> {
  const steps: Step[] = [
    { method: "POST", path: "/api/sessions", status: 201, body: session("STOPPED") },
    { method: "GET", path: sessionPath, status: 200, body: session("STOPPED") },
    { method: "POST", path: `${sessionPath}/start`, status: 201, body: session("STARTING") },
    { method: "GET", path: sessionPath, status: 200, body: session("SCAN_QR_CODE") },
  ];
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
    const client = new WahaClient(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      "k",
      opts,
    );
    await client.startSession(name);
    expect(unexpected).toEqual([]);
    expect(steps).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return corpos;
}

const proxyDaSessao = { server: "104.165.145.114:6247", username: "user-1", password: "s3nh@" };

describe("criação com proxy da sessão", () => {
  it("a sessão nasce com config.proxy (servidor, usuário e senha)", async () => {
    const corpos = await corposDeCriacao({ proxyDaSessao });
    expect(corpos).toEqual([
      { name, start: false, config: { ignore: CONVERSAS_IGNORADAS, proxy: proxyDaSessao } },
    ]);
  });

  it("convive com o webhook da sessão", async () => {
    const webhookDaSessao = { url: "http://app:3000/api/v1/webhooks/waha" };
    const corpos = await corposDeCriacao({ proxyDaSessao, webhookDaSessao });
    expect(corpos).toEqual([
      {
        name,
        start: false,
        config: {
          ignore: CONVERSAS_IGNORADAS,
          webhooks: [{ url: webhookDaSessao.url, events: [...EVENTOS_DO_WEBHOOK] }],
          proxy: proxyDaSessao,
        },
      },
    ]);
  });

  it("proxy sem autenticação vai só com o servidor", async () => {
    const corpos = await corposDeCriacao({ proxyDaSessao: { server: "10.0.0.1:3128" } });
    expect((corpos[0] as { config: { proxy: unknown } }).config.proxy).toEqual({
      server: "10.0.0.1:3128",
    });
  });
});

describe("lerProxyDaSessao", () => {
  it("URL completa: separa servidor e credenciais, decodificando", () => {
    expect(lerProxyDaSessao("http://us%40er:p%3Ass@104.165.145.114:6247")).toEqual({
      server: "104.165.145.114:6247",
      username: "us@er",
      password: "p:ss",
    });
  });

  it("host:porta sem esquema e sem credencial", () => {
    expect(lerProxyDaSessao("10.0.0.1:3128")).toEqual({ server: "10.0.0.1:3128" });
  });

  it("vazio ou inválido = sem proxy (nunca lança)", () => {
    expect(lerProxyDaSessao(undefined)).toBeNull();
    expect(lerProxyDaSessao("   ")).toBeNull();
    expect(lerProxyDaSessao("http://")).toBeNull();
    expect(lerProxyDaSessao("sem-porta")).toBeNull();
  });
});

describe("getWahaClient lê WAHA_SESSION_PROXY", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("o proxy vale, e opcoes() não expõe a senha", () => {
    vi.stubEnv("WAHA_API_BASE_URL", "http://wa-ha:3000");
    vi.stubEnv("WAHA_API_KEY", "real-key");
    vi.stubEnv("WAHA_SESSION_PROXY", "http://user-1:s3nh%40@104.165.145.114:6247");
    const opcoes = getWahaClient()?.opcoes();
    expect(opcoes?.proxyDaSessao).toEqual({ server: "104.165.145.114:6247", autenticado: true });
    expect(JSON.stringify(opcoes)).not.toContain("s3nh");
  });

  it("sem a variável, sem proxy", () => {
    vi.stubEnv("WAHA_API_BASE_URL", "http://wa-ha:3000");
    vi.stubEnv("WAHA_API_KEY", "real-key");
    vi.stubEnv("WAHA_SESSION_PROXY", "");
    expect(getWahaClient()?.opcoes().proxyDaSessao).toBeNull();
  });
});
