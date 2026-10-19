/**
 * O fio do GA4 — Measurement Protocol (`/mp/collect`).
 *
 * Três regras do fornecedor que mudam o desenho:
 *
 * 1. O `api_secret` vai na QUERY STRING — exigência do Google, não nossa. Por
 *    isso a URL montada nunca sai daqui: nada de logar `url`, e o texto de erro
 *    de rede passa por `semSegredo` antes de virar `detalhe`.
 * 2. `/mp/collect` responde 2xx até para evento inválido. "ok" aqui significa
 *    "aceito", nunca "processado". A validação de verdade é `/debug/mp/collect`,
 *    usada só pelo botão "Testar conexão" (`validarNoGa4`).
 * 3. Evento com `timestamp_micros` mais velho que 72h é descartado em silêncio
 *    pelo GA4 — então a recusa é feita AQUI, legível, antes da rede.
 *
 * Nenhum dado pessoal no corpo: só o `client_id` (cookie do próprio site) e,
 * na compra, o id do lead como `transaction_id`.
 */
import type { ResultadoDeEnvio } from "../types";
import type { EventoDeVendaGa4 } from "@/lib/conversoes/regras-ga4";
import { hostDoGa4 } from "./base";
import type { IdentidadeGa4 } from "./identidade";

export const IDADE_MAXIMA_GA4_MS = 72 * 60 * 60 * 1000;
const TEMPO_LIMITE_MS = 10_000;

export interface CredencialGa4 {
  measurementId: string;
  apiSecret: string;
  wonEvent: EventoDeVendaGa4;
}

export interface EventoGa4 {
  nome: string;
  identidade: IdentidadeGa4;
  ocorridoEm: Date;
  valorCentavos: number | null;
  moeda: string | null;
  transactionId: string | null;
}

function url(caminho: "/mp/collect" | "/debug/mp/collect", c: CredencialGa4): string {
  const q = new URLSearchParams({ measurement_id: c.measurementId, api_secret: c.apiSecret });
  return `${hostDoGa4()}${caminho}?${q.toString()}`;
}

function semSegredo(texto: string, c: CredencialGa4): string {
  return texto.split(c.apiSecret).join("***").slice(0, 400);
}

function corpo(e: EventoGa4): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (e.identidade.sessionId) params.session_id = e.identidade.sessionId;
  // Sem engagement_time_msec o GA4 não conta o evento na sessão.
  params.engagement_time_msec = 1;
  if (e.valorCentavos !== null && e.moeda) {
    params.value = e.valorCentavos / 100;
    params.currency = e.moeda.toUpperCase();
  }
  if (e.transactionId) params.transaction_id = e.transactionId;
  return {
    client_id: e.identidade.clientId,
    timestamp_micros: e.ocorridoEm.getTime() * 1000,
    non_personalized_ads: false,
    events: [{ name: e.nome, params }],
  };
}

function velhoDemais(e: EventoGa4): ResultadoDeEnvio | null {
  const idade = Date.now() - e.ocorridoEm.getTime();
  if (idade <= IDADE_MAXIMA_GA4_MS) return null;
  const horas = Math.floor(idade / 3_600_000);
  return {
    tipo: "permanente",
    detalhe: `evento com ${horas}h — o GA4 descarta acima de 72h. Ocorreu em ${e.ocorridoEm.toISOString()}.`,
  };
}

export async function enviarEventoGa4(c: CredencialGa4, e: EventoGa4): Promise<ResultadoDeEnvio> {
  const recusa = velhoDemais(e);
  if (recusa) return recusa;
  let resposta: Response;
  try {
    resposta = await fetch(url("/mp/collect", c), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo(e)),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (erro) {
    return {
      tipo: "transitorio",
      detalhe: semSegredo(erro instanceof Error ? erro.message : "falha de rede", c),
    };
  }
  if (resposta.ok)
    return { tipo: "ok", detalhe: "aceito pelo GA4 (o GA4 não confirma o processamento)" };
  const texto = semSegredo(await resposta.text().catch(() => ""), c);
  if (resposta.status === 429 || resposta.status >= 500)
    return { tipo: "transitorio", detalhe: `${resposta.status}: ${texto}` };
  return { tipo: "permanente", detalhe: `${resposta.status}: ${texto}` };
}

export async function validarNoGa4(
  c: CredencialGa4,
  e: EventoGa4,
): Promise<{ ok: true } | { ok: false; mensagens: string[] }> {
  try {
    const resposta = await fetch(url("/debug/mp/collect", c), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo(e)),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!resposta.ok) return { ok: false, mensagens: [`HTTP ${resposta.status}`] };
    const json = (await resposta.json().catch(() => null)) as {
      validationMessages?: { description?: string; fieldPath?: string }[];
    } | null;
    const msgs = (json?.validationMessages ?? []).map((m) =>
      semSegredo(`${m.fieldPath ? `${m.fieldPath}: ` : ""}${m.description ?? "inválido"}`, c),
    );
    return msgs.length === 0 ? { ok: true } : { ok: false, mensagens: msgs };
  } catch (erro) {
    return {
      ok: false,
      mensagens: [semSegredo(erro instanceof Error ? erro.message : "falha de rede", c)],
    };
  }
}
