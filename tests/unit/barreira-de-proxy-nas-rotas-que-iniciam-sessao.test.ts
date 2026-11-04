import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TODA ROTA QUE INICIA SESSÃO WAHA PASSA PELA BARREIRA DE PROXY.
 *
 * No modo de pool gerenciado (opt-in), iniciar uma sessão sem antes confirmar o
 * proxy individual é exatamente o defeito que a feature existe para impedir. Uma
 * rota nova ou esquecida que chame o início direto vira um caminho que conecta
 * número sem proxy — e o teste de uma rota não enxerga a outra. Por isso:
 *
 *   1. a lista das rotas cobertas é literal e cada uma precisa ligar a barreira;
 *   2. uma varredura de `app/` reprova qualquer arquivo que inicie sessão e não
 *      esteja na lista.
 *
 * Fora desta cerca, e declarado: o reconciliador do worker
 * (`lib/agent-engine/edge/crm/session-reconciler.ts`) envia `POST .../start`
 * direto para sessões `STOPPED` e AINDA NÃO usa a barreira (plano Fase 3.3).
 */
const RAIZ = process.cwd();
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8");

/** Rotas que passam a identidade do canal ao conector (`proxyAntesDoInicio`). */
const VIA_CONECTOR = [
  "app/api/v1/channel-sessions/route.ts",
  "app/api/v1/onboarding/whatsapp/session/route.ts",
] as const;
/** Rota que reinicia a sessão por conta própria (stop → start). */
const VIA_RECONNECT = ["app/api/v1/channel-sessions/[id]/reconnect/route.ts"] as const;

const INICIA_SESSAO = /connectWahaChannel\(|\.startSession\(|\.startExistingSession\(/;

function arquivosTs(dir: string): string[] {
  return readdirSync(join(RAIZ, dir)).flatMap((nome) => {
    const rel = `${dir}/${nome}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) return arquivosTs(rel);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome) ? [rel] : [];
  });
}

describe("a barreira de proxy cobre toda rota que inicia sessão", () => {
  it.each(VIA_CONECTOR)("%s liga a barreira ao conector", (rota) => {
    const fonte = ler(rota);
    expect(fonte).toMatch(/barreiraDeProxyDaRota\(/);
    expect(fonte).toMatch(/proxyAntesDoInicio:\s*proxy\.barreira/);
    expect(fonte).toMatch(/falhaDeProxyDaConexao\(/);
  });

  it.each(VIA_RECONNECT)("%s confirma o proxy entre o stop e o start", (rota) => {
    const fonte = ler(rota);
    expect(fonte).toMatch(/barreiraDeProxyDaRota\(/);
    const barreira = fonte.indexOf("proxy.barreira(");
    expect(barreira).toBeGreaterThan(fonte.indexOf("waha.stopSession("));
    expect(barreira).toBeLessThan(fonte.indexOf("waha.startSession("));
  });

  it("nenhum outro arquivo de app/ inicia sessão sem estar nesta lista", () => {
    const cobertas = new Set<string>([...VIA_CONECTOR, ...VIA_RECONNECT]);
    const soltas = arquivosTs("app").filter((f) => INICIA_SESSAO.test(ler(f)) && !cobertas.has(f));
    expect(soltas).toEqual([]);
  });
});
