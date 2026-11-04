import { afterEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";

import { reconcileSessions } from "@/lib/agent-engine/edge/crm/session-reconciler";
import { ErroDeProxy } from "@/lib/waha/proxy-antes-do-inicio";

/**
 * O RECONCILIADOR NÃO RELIGA SESSÃO SEM PROXY NO MODO DE POOL.
 *
 * `reconcileSessions` dá `POST .../start` direto em toda sessão `STOPPED` nossa,
 * fora do fluxo de conexão do CRM. No modo de pool gerenciado isso religaria um
 * número sem proxy individual — o defeito que a feature existe para impedir.
 * Com `barreiraDeProxy` na config, o start só sai depois dela confirmar; sem a
 * config (self-host comum), o comportamento é o de sempre.
 */
const logFake = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const base = {
  wahaBaseUrl: "http://waha.local",
  wahaApiKey: "chave",
  intervalMs: 1,
  redriveMinAgeMs: 0,
  redriveBatchSize: 10,
  redriveSpacingMs: 0,
};

function poolFalso(status = "STOPPED") {
  const query = vi.fn(async (sql: string) => {
    if (/select cs\.id, cs\.status/i.test(sql)) return { rows: [{ id: "c1", status }] };
    if (/update channel_sessions/i.test(sql)) return { rows: [{ id: "c1", status: "x" }] };
    return { rows: [] };
  });
  return { query } as unknown as pg.Pool;
}

function wahaCom(nome: string, status = "STOPPED") {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).includes("/start")) return new Response("{}", { status: 201 });
    return new Response(JSON.stringify([{ name: nome, status }]), { status: 200 });
  });
}

const starts = (f: ReturnType<typeof wahaCom>) =>
  f.mock.calls.filter(([u]) => String(u).includes("/start"));

afterEach(() => vi.restoreAllMocks());

describe("reconcileSessions com barreira de proxy", () => {
  it("sem barreira configurada religa como sempre (contrato legado)", async () => {
    const f = wahaCom("legado-1");
    await reconcileSessions(poolFalso(), base as never, logFake as never);
    expect(starts(f)).toHaveLength(1);
  });

  it("confirma o proxy ANTES do start", async () => {
    const f = wahaCom("ok-1");
    const barreira = vi.fn(async () => {});
    await reconcileSessions(
      poolFalso(),
      { ...base, barreiraDeProxy: barreira } as never,
      logFake as never,
    );
    expect(barreira).toHaveBeenCalledWith("ok-1");
    expect(barreira.mock.invocationCallOrder[0]!).toBeLessThan(
      f.mock.invocationCallOrder[f.mock.calls.findIndex(([u]) => String(u).includes("/start"))]!,
    );
    expect(starts(f)).toHaveLength(1);
  });

  it("barreira que falha NÃO inicia, avisa com código seguro e não troca o espelho", async () => {
    const f = wahaCom("falha-1");
    const pool = poolFalso();
    const barreira = vi.fn(async () => {
      throw new ErroDeProxy("proxy_nao_confirmado", "pool_esgotado");
    });
    await reconcileSessions(
      pool,
      { ...base, barreiraDeProxy: barreira } as never,
      logFake as never,
    );
    expect(starts(f)).toHaveLength(0);
    expect(logFake.warn).toHaveBeenCalledWith(
      expect.stringContaining("proxy"),
      expect.objectContaining({ waha_session: "falha-1", proxy: "pool_esgotado" }),
    );
    // O espelho já estava STOPPED, igual ao WAHA: nenhuma escrita.
    const escritas = (pool.query as ReturnType<typeof vi.fn>).mock.calls.filter(([sql]) =>
      /update channel_sessions/i.test(String(sql)),
    );
    expect(escritas).toHaveLength(0);
  });

  it("erro qualquer da barreira também bloqueia o start (falha fechado)", async () => {
    const f = wahaCom("falha-2");
    await reconcileSessions(
      poolFalso(),
      {
        ...base,
        barreiraDeProxy: vi.fn(async () => {
          throw new Error("boom");
        }),
      } as never,
      logFake as never,
    );
    expect(starts(f)).toHaveLength(0);
  });

  it("depois de falhar, espera antes de tentar de novo (não bate no provisionador a cada tick)", async () => {
    wahaCom("espera-1");
    const barreira = vi.fn(async () => {
      throw new ErroDeProxy("proxy_nao_confirmado", "indisponivel");
    });
    const cfg = { ...base, barreiraDeProxy: barreira } as never;
    await reconcileSessions(poolFalso(), cfg, logFake as never);
    await reconcileSessions(poolFalso(), cfg, logFake as never);
    expect(barreira).toHaveBeenCalledTimes(1);
  });

  it("só consulta a barreira para sessão que seria religada (STOPPED)", async () => {
    const f = wahaCom("working-1", "WORKING");
    const barreira = vi.fn(async () => {});
    await reconcileSessions(
      poolFalso("WORKING"),
      { ...base, barreiraDeProxy: barreira } as never,
      logFake as never,
    );
    expect(barreira).not.toHaveBeenCalled();
    expect(starts(f)).toHaveLength(0);
  });
});
