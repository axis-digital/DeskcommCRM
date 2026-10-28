/**
 * O WEBHOOK DA SESSÃO SUMIA E NADA O DEVOLVIA.
 *
 * ─── O defeito, medido numa instalação real (2026-10-27) ────────────────────
 *
 * Com `WAHA_SESSION_WEBHOOK=true` (WAHA compartilhado, sem hook global), o
 * webhook do CRM mora NA config da sessão — e era gravado lá uma vez só, na
 * criação (`configDeCriacao`). Um PUT feito por fora (no caso, um ajuste de
 * proxy à mão) substituiu a config inteira, como o PUT do WAHA faz, e o bloco
 * `webhooks` foi junto. A sessão seguiu `WORKING`, o envio seguiu funcionando,
 * e por SETE DIAS nenhuma mensagem recebida chegou ao CRM. Nada ficou vermelho.
 *
 * A convergência (`convergirConfigDaSessao`) já fazia GET + merge + PUT em toda
 * reconexão — mas só olhava `ignore` e o acervo. Nunca o webhook.
 *
 * ─── O que este arquivo segura ──────────────────────────────────────────────
 *
 *  1. A convergência só dá a sessão por conferida quando o webhook do CRM está
 *     lá: mesma URL, TODOS os eventos do contrato, e o HMAC quando há segredo.
 *  2. Ao recolocar, ela PRESERVA webhooks de terceiros — o WAHA é compartilhado
 *     e o PUT substitui a config inteira: apagar o webhook alheio seria repetir,
 *     no sistema vizinho, o defeito que estamos consertando aqui.
 *  3. Sem modo por sessão (hook global), `webhooks` não é assunto do CRM.
 *  4. Sessão já correta não leva PUT (o PUT reinicia a sessão).
 *  5. O vigia periódico (`reafirmarWebhookSeSumiu`, chamado pelo `checkHealth`)
 *     cura a sessão conectada sem webhook — e não reinicia em laço.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

import {
  CONVERSAS_IGNORADAS,
  EVENTOS_DO_WEBHOOK,
  WahaClient,
  esquecerReafirmacoesDeWebhook,
  type WahaSessionWebhook,
} from "./client";

const NOME = "s1";
const URL_DO_CRM = "http://crm-app:3000/api/v1/webhooks/waha";
const SEGREDO = "h".repeat(32);
const COM_HMAC: WahaSessionWebhook = { url: URL_DO_CRM, hmacKey: SEGREDO };
const ALHEIO = {
  url: "https://outro-sistema.example/hook",
  events: ["message"],
  hmac: { key: "segredo-do-vizinho" },
  retries: { policy: "constant", delaySeconds: 2, attempts: 3 },
};

type Config = Record<string, unknown> & { webhooks?: unknown[] };
let server: Server;
let base = "";
let sessao: { name: string; status: string; engine: { engine: string }; config: Config };
let puts: Array<{ name: string; config: Config }> = [];
let chamadas: string[] = [];
let sessaoJaExiste = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    let corpo = "";
    req.on("data", (c: Buffer) => (corpo += c.toString()));
    req.on("end", () => {
      chamadas.push(`${req.method} ${req.url}`);
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/sessions" && req.method === "POST") {
        if (sessaoJaExiste) {
          res.statusCode = 422;
          return res.end(
            JSON.stringify({
              statusCode: 422,
              error: "Unprocessable Entity",
              message: `Session '${NOME}' already exists. Use PUT to update it.`,
            }),
          );
        }
        res.statusCode = 201;
        return res.end(JSON.stringify(sessao));
      }
      if (req.url === `/api/sessions/${NOME}` && req.method === "GET")
        return res.end(JSON.stringify(sessao));
      if (req.url === `/api/sessions/${NOME}` && req.method === "PUT") {
        const j = JSON.parse(corpo) as { name: string; config: Config };
        puts.push(j);
        sessao = { ...sessao, config: j.config };
        return res.end(JSON.stringify(sessao));
      }
      if (req.url === `/api/sessions/${NOME}/start` && req.method === "POST") {
        res.statusCode = 422;
        return res.end(
          JSON.stringify({
            statusCode: 422,
            error: "Unprocessable Entity",
            message: `Session '${NOME}' is already started.`,
          }),
        );
      }
      if (req.url === "/api/server/version") return res.end(JSON.stringify({ engine: "NOWEB" }));
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  puts = [];
  chamadas = [];
  sessaoJaExiste = false;
  esquecerReafirmacoesDeWebhook();
  sessao = {
    name: NOME,
    status: "WORKING",
    engine: { engine: "NOWEB" },
    config: { ignore: { ...CONVERSAS_IGNORADAS }, webhooks: [] },
  };
});
afterEach(() => vi.restoreAllMocks());

const cliente = (webhookDaSessao: WahaSessionWebhook | null = COM_HMAC) =>
  new WahaClient(base, "chave-teste", { webhookDaSessao });

const entradaDoCrm = (extra: Record<string, unknown> = {}) => ({
  url: URL_DO_CRM,
  events: [...EVENTOS_DO_WEBHOOK],
  hmac: { key: SEGREDO },
  ...extra,
});

describe("convergirConfigDaSessao reafirma o webhook do CRM", () => {
  it("sessão sem webhook nenhum → PUT com o webhook do CRM (URL, eventos do contrato, HMAC)", async () => {
    await expect(cliente().convergirConfigDaSessao(NOME)).resolves.toBe(true);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
    // O resto da config sai como estava — a convergência enxerta, não substitui.
    expect(puts[0]!.config.ignore).toEqual(CONVERSAS_IGNORADAS);
  });

  it("config sem a chave `webhooks` (o PUT de fora a apagou) → PUT com o webhook do CRM", async () => {
    sessao.config = { ignore: { ...CONVERSAS_IGNORADAS }, proxy: { server: "p:1" } };
    await cliente().convergirConfigDaSessao(NOME);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
    expect(puts[0]!.config.proxy).toEqual({ server: "p:1" });
  });

  it("webhook de TERCEIRO é preservado byte a byte, e o do CRM entra ao lado", async () => {
    sessao.config.webhooks = [ALHEIO];
    await cliente().convergirConfigDaSessao(NOME);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.config.webhooks).toEqual([ALHEIO, entradaDoCrm()]);
  });

  it("webhook do CRM já correto (eventos em OUTRA ordem, com extras) → nenhum PUT", async () => {
    sessao.config.webhooks = [
      ALHEIO,
      entradaDoCrm({ events: [...EVENTOS_DO_WEBHOOK].reverse().map(String).concat("presence.update") }),
    ];
    await expect(cliente().convergirConfigDaSessao(NOME)).resolves.toBe(true);
    expect(puts).toHaveLength(0);
  });

  it("faltando eventos → PUT só na entrada do CRM, mantendo os campos dela (retries) e a posição", async () => {
    const retries = { policy: "constant", delaySeconds: 2, attempts: 15 };
    sessao.config.webhooks = [
      entradaDoCrm({ events: ["message.any", "message.ack"], retries }),
      ALHEIO,
    ];
    await cliente().convergirConfigDaSessao(NOME);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm({ retries }), ALHEIO]);
  });

  it("entrada do CRM duplicada colapsa numa só (duas entregariam cada evento em dobro)", async () => {
    sessao.config.webhooks = [
      { url: URL_DO_CRM, events: ["message.any"] },
      { url: URL_DO_CRM, events: ["message.ack"] },
    ];
    await cliente().convergirConfigDaSessao(NOME);
    expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
  });

  describe("HMAC", () => {
    it("com segredo, entrada sem hmac → PUT com o hmac", async () => {
      sessao.config.webhooks = [{ url: URL_DO_CRM, events: [...EVENTOS_DO_WEBHOOK], hmac: null }];
      await cliente().convergirConfigDaSessao(NOME);
      expect(puts).toHaveLength(1);
      expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
    });

    it("com segredo, hmac com OUTRA chave (segredo trocado) → PUT com a chave atual", async () => {
      sessao.config.webhooks = [entradaDoCrm({ hmac: { key: "chave-velha" } })];
      await cliente().convergirConfigDaSessao(NOME);
      expect(puts).toHaveLength(1);
      expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
    });

    it("sem segredo, entrada sem hmac já é a correta → nenhum PUT", async () => {
      sessao.config.webhooks = [{ url: URL_DO_CRM, events: [...EVENTOS_DO_WEBHOOK] }];
      await cliente({ url: URL_DO_CRM }).convergirConfigDaSessao(NOME);
      expect(puts).toHaveLength(0);
    });
  });

  describe("sem modo por sessão (hook global): `webhooks` não é assunto do CRM", () => {
    it("filtro e acervo certos, sessão sem webhook → nenhum PUT", async () => {
      await cliente(null).convergirConfigDaSessao(NOME);
      expect(puts).toHaveLength(0);
    });

    it("filtro errado → o PUT corrige o filtro e leva `webhooks` exatamente como estava", async () => {
      sessao.config = { ignore: { ...CONVERSAS_IGNORADAS, status: false }, webhooks: [ALHEIO] };
      await cliente(null).convergirConfigDaSessao(NOME);
      expect(puts).toHaveLength(1);
      expect(puts[0]!.config.webhooks).toEqual([ALHEIO]);
    });
  });

  it("filtro E webhook errados → UM PUT só, com os dois consertos", async () => {
    sessao.config = { ignore: { ...CONVERSAS_IGNORADAS, status: false }, webhooks: [] };
    await cliente().convergirConfigDaSessao(NOME);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.config.ignore).toEqual(CONVERSAS_IGNORADAS);
    expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
  });

  it("recolocar deixa rastro no log — sem vazar o segredo do HMAC", async () => {
    const warn = vi.spyOn(logger, "warn");
    const info = vi.spyOn(logger, "info");
    await cliente().convergirConfigDaSessao(NOME);
    const linhas = [...warn.mock.calls, ...info.mock.calls].map((c) => JSON.stringify(c));
    expect(linhas.some((l) => l.includes("webhook"))).toBe(true);
    expect(linhas.join("\n")).not.toContain(SEGREDO);
  });
});

describe("startSession numa sessão que já existe", () => {
  it("filtro certo mas webhook sumido → a reconexão converge (GET + PUT) antes de iniciar", async () => {
    sessaoJaExiste = true;
    await expect(cliente().startSession(NOME)).resolves.toMatchObject({ status: "WORKING" });
    expect(puts).toHaveLength(1);
    expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
  });

  it("tudo certo → reconexão sem PUT (não reinicia a sessão à toa)", async () => {
    sessaoJaExiste = true;
    sessao.config.webhooks = [entradaDoCrm()];
    await cliente().startSession(NOME);
    expect(puts).toHaveLength(0);
  });
});

describe("reafirmarWebhookSeSumiu — o vigia periódico", () => {
  const snapshot = () => JSON.parse(JSON.stringify(sessao)) as unknown;

  it("fora do modo por sessão → não fala com o WAHA", async () => {
    await expect(cliente(null).reafirmarWebhookSeSumiu(NOME, snapshot())).resolves.toBe(
      "fora_do_modo",
    );
    expect(chamadas).toEqual([]);
  });

  it("webhook conferido no retrato que o vigia já tem → nenhuma chamada a mais", async () => {
    sessao.config.webhooks = [entradaDoCrm()];
    await expect(cliente().reafirmarWebhookSeSumiu(NOME, snapshot())).resolves.toBe("conferido");
    expect(chamadas).toEqual([]);
  });

  it("sessão conectada sem webhook → recoloca", async () => {
    await expect(cliente().reafirmarWebhookSeSumiu(NOME, snapshot())).resolves.toBe("recolocado");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
  });

  it("sessão que não está WORKING → não mexe (QR, falha e parada têm outro dono)", async () => {
    for (const status of ["SCAN_QR_CODE", "FAILED", "STOPPED", "STARTING"]) {
      sessao.status = status;
      await expect(cliente().reafirmarWebhookSeSumiu(NOME, snapshot())).resolves.toBe(
        "nao_conectada",
      );
    }
    expect(puts).toHaveLength(0);
  });

  it("não reinicia em laço: dentro da espera, a segunda tentativa não faz PUT", async () => {
    const retrato = snapshot();
    await expect(cliente().reafirmarWebhookSeSumiu(NOME, retrato)).resolves.toBe("recolocado");
    await expect(cliente().reafirmarWebhookSeSumiu(NOME, retrato)).resolves.toBe("em_espera");
    expect(puts).toHaveLength(1);
  });

  it("retrato ilegível → não arrisca PUT", async () => {
    await expect(cliente().reafirmarWebhookSeSumiu(NOME, { status: "WORKING" })).resolves.toBe(
      "nao_conectada",
    );
    await expect(cliente().reafirmarWebhookSeSumiu(NOME, null)).resolves.toBe("nao_conectada");
    expect(puts).toHaveLength(0);
  });
});

describe("o checkHealth do canal por QR chama o vigia", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sessão WORKING sem webhook: a saúde sai igual E o webhook volta", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", base);
    vi.stubEnv("WAHA_API_KEY", "chave-teste");
    vi.stubEnv("WAHA_WEBHOOK_BASE_URL", "http://crm-app:3000");
    vi.stubEnv("WAHA_HMAC_SECRET", SEGREDO);
    vi.stubEnv("WAHA_SESSION_WEBHOOK", "true");
    vi.stubEnv("WAHA_SESSION_PROXY", "");
    vi.stubEnv("WAHA_ACCEPTED_ENGINES", "");
    const { getAdapter } = await import("@/lib/channels");
    const saude = await getAdapter("waha").checkHealth!({
      organizationId: "org",
      sessionRef: NOME,
    });
    expect(saude).toEqual({ reachable: true, status: "WORKING", detail: null });
    expect(puts).toHaveLength(1);
    expect(puts[0]!.config.webhooks).toEqual([entradaDoCrm()]);
  });
});
