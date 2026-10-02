/**
 * IMPORTAÇÃO DO HISTÓRICO DO WHATSAPP AO PAREAR UM NÚMERO (fork Axis).
 *
 * Com o sync completo ligado no WAHA, o celular entrega até N dias de conversas
 * logo depois da leitura do QR — mas ao WAHA, não ao CRM: o webhook só traz o
 * que chega dali em diante. Este módulo busca esse passado no WAHA e grava pelo
 * banco com `fn_importar_historico_wa` (migration 0900), que silencia os
 * gatilhos de efeito: nada de `message.received`, demanda, roteamento ou
 * agente respondendo a mensagem de meses atrás.
 *
 * A identidade de contato e o `external_id` seguem EXATAMENTE as regras do
 * webhook (`lib/waha/ingest.ts`) — inbound grava o id completo, outbound o
 * bare — para a mensagem que os dois caminhos virem casar no unique e não
 * duplicar.
 *
 * Quando roda: na virada `SCAN_QR_CODE → WORKING` (pareamento novo), nunca num
 * restart. O celular manda o histórico aos poucos, então a importação roda em
 * RODADAS espaçadas até duas seguidas não acharem nada novo. Ligada por
 * `WAHA_HISTORY_IMPORT_DAYS` (0 = desligada, o comportamento do upstream).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { logger } from "@/lib/logger";
import { getWahaClient, type WahaClient } from "@/lib/waha/client";
import { wahaPayloadSchema, type WahaPayload } from "@/lib/waha/envelope";
import {
  bodyOf,
  dataDoTimestamp,
  ehEnderecavel,
  mediaMimeOf,
  mediaUrlOf,
  notifyNameOf,
  parseChatId,
  previewFromMessage,
  resolveMessageType,
  telefoneAlternativoDe,
} from "@/lib/waha/ingest";
import { bareWaMessageId, chatIdFromWaMessageId } from "@/lib/waha/message-id";

/** Uma linha do lote, no formato que `fn_importar_historico_wa` lê. */
export interface LinhaDeHistorico {
  chat_id: string;
  kind: "phone" | "lid";
  phone: string | null;
  lid: string | null;
  notify: string | null;
  external_id: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  media_mime: string | null;
  sent_at: string;
  ack: number | null;
  raw_type: string | null;
  preview: string;
}

export interface ResultadoDaImportacao {
  chats: number;
  mensagensLidas: number;
  inseridas: number;
  duplicadas: number;
  ignoradas: number;
  falhas: number;
}

export interface SessaoParaImportar {
  id: string;
  organization_id: string;
  waha_session_name: string;
}

type ClienteDeHistorico = Pick<WahaClient, "listarChats" | "listarMensagensDoChat">;

const TAMANHO_DA_PAGINA_DE_CHATS = 100;
const TAMANHO_DA_PAGINA_DE_MENSAGENS = 200;
const TAMANHO_DO_LOTE = 200;
const MAX_MENSAGENS_POR_CHAT = 20_000;
const MAX_DIAS = 3650;

/**
 * O GOWS não manda `type` e guarda o conteúdo em `_data.Message` (maiúsculo),
 * que `resolveMessageType` não lê. Sem isto, foto sem legenda viraria "texto"
 * vazio.
 */
const TIPO_POR_CHAVE_GOWS: Record<string, string> = {
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  documentMessage: "document",
  documentWithCaptionMessage: "document",
  stickerMessage: "sticker",
  locationMessage: "location",
  contactMessage: "contact",
};

function dadosGows(p: WahaPayload): { Message?: unknown; Info?: Record<string, unknown> } {
  const d = p._data as Record<string, unknown> | undefined;
  return {
    Message: d?.Message,
    Info: d?.Info && typeof d.Info === "object" ? (d.Info as Record<string, unknown>) : undefined,
  };
}

function tipoDoGows(p: WahaPayload): string | null {
  const { Message } = dadosGows(p);
  if (!Message || typeof Message !== "object") return null;
  for (const [chave, tipo] of Object.entries(TIPO_POR_CHAVE_GOWS)) {
    if (chave in Message) return tipo;
  }
  return null;
}

function nomeDoRemetente(p: WahaPayload): string | null {
  const pushGows = dadosGows(p).Info?.PushName;
  return notifyNameOf(p) ?? (typeof pushGows === "string" && pushGows.trim() ? pushGows : null);
}

/**
 * Converte uma mensagem do WAHA numa linha do lote, ou `null` se ela não vira
 * mensagem no CRM (grupo, chat não endereçável, evento vazio, sem id/data).
 *
 * `chatDaLista` é o id da conversa como `/chats` o devolveu: no GOWS ele vem
 * como TELEFONE mesmo quando a mensagem traz só o `@lid` — e é dele que sai o
 * número quando o payload não traz `remoteJidAlt`.
 */
export function paraLinhaDeHistorico(p: WahaPayload, chatDaLista: string): LinhaDeHistorico | null {
  if (!p.id || typeof p.timestamp !== "number") return null;
  const texto = bodyOf(p);
  const tipoGows = tipoDoGows(p);
  if (!texto && !mediaUrlOf(p) && !p.hasMedia && !tipoGows) return null;

  const deMim = p.fromMe === true;
  // Mesma ordem de confiança do webhook (`handleOutboundFromUserPhone`).
  const chatId = deMim ? (p.to ?? chatIdFromWaMessageId(p.id) ?? p.from ?? "") : (p.from ?? "");
  const parsed = parseChatId(chatId);
  if (!ehEnderecavel(parsed) || (parsed.kind !== "phone" && parsed.kind !== "lid")) return null;

  const daLista = parseChatId(chatDaLista);
  if (daLista.kind === "group") return null;
  const alternativo = telefoneAlternativoDe(p) ?? (daLista.kind === "phone" ? daLista.phone : null);
  const phone =
    parsed.kind === "phone"
      ? canonicalPhoneBR(parsed.phone)
      : alternativo
        ? canonicalPhoneBR(alternativo)
        : null;

  const tipo = tipoGows ?? resolveMessageType(p);
  return {
    chat_id: chatId,
    kind: parsed.kind,
    phone,
    lid: parsed.kind === "lid" ? parsed.lid : null,
    // fromMe: o nome no payload é o do OPERADOR — nunca batiza o contato.
    notify: deMim ? null : nomeDoRemetente(p),
    external_id: deMim ? bareWaMessageId(p.id) : p.id,
    direction: deMim ? "outbound" : "inbound",
    type: tipo,
    body: texto,
    media_mime: mediaMimeOf(p),
    sent_at: dataDoTimestamp(p.timestamp, new Date(p.timestamp * 1000).toISOString()),
    ack: typeof p.ack === "number" ? p.ack : null,
    raw_type: p.type ?? null,
    preview: texto ? texto.slice(0, 280) : tipo !== "text" ? `[${tipo}]` : previewFromMessage(p),
  };
}

async function gravarLote(
  admin: SupabaseClient,
  sessao: SessaoParaImportar,
  linhas: LinhaDeHistorico[],
): Promise<{ inseridas: number; duplicadas: number; ignoradas: number }> {
  const { data, error } = await admin.rpc("fn_importar_historico_wa" as never, {
    p_org: sessao.organization_id,
    p_session: sessao.id,
    p_mensagens: linhas,
  } as never);
  if (error) throw new Error(`historico_lote: ${(error as { message?: string }).message ?? "erro"}`);
  const r = (data ?? {}) as Partial<Record<"inseridas" | "duplicadas" | "ignoradas", number>>;
  return { inseridas: r.inseridas ?? 0, duplicadas: r.duplicadas ?? 0, ignoradas: r.ignoradas ?? 0 };
}

/**
 * Uma rodada: percorre as conversas da mais recente para a mais antiga até a
 * janela de `dias`, lê as mensagens de cada uma e grava em lotes. Falha numa
 * conversa conta e segue; falha do BANCO aborta (é sistêmica, não de um chat).
 */
export async function importarHistoricoDaSessao(
  deps: { admin: SupabaseClient; client: ClienteDeHistorico },
  sessao: SessaoParaImportar,
  opts: { dias: number; agora?: Date },
): Promise<ResultadoDaImportacao> {
  const agora = opts.agora ?? new Date();
  const desde = Math.floor(agora.getTime() / 1000) - Math.min(opts.dias, MAX_DIAS) * 86_400;
  const total: ResultadoDaImportacao = {
    chats: 0,
    mensagensLidas: 0,
    inseridas: 0,
    duplicadas: 0,
    ignoradas: 0,
    falhas: 0,
  };
  let lote: LinhaDeHistorico[] = [];

  const descarregar = async () => {
    if (lote.length === 0) return;
    const r = await gravarLote(deps.admin, sessao, lote);
    lote = [];
    total.inseridas += r.inseridas;
    total.duplicadas += r.duplicadas;
    total.ignoradas += r.ignoradas;
  };

  for (let offset = 0; ; offset += TAMANHO_DA_PAGINA_DE_CHATS) {
    const chats = await deps.client.listarChats(sessao.waha_session_name, {
      limit: TAMANHO_DA_PAGINA_DE_CHATS,
      offset,
    });
    let passouDaJanela = false;
    for (const chat of chats) {
      if (chat.ultimaEm !== null && chat.ultimaEm < desde) {
        passouDaJanela = true;
        break;
      }
      const tipo = parseChatId(chat.chatId).kind;
      if (tipo !== "phone" && tipo !== "lid") continue;
      total.chats += 1;
      try {
        for (let deslocamento = 0; deslocamento < MAX_MENSAGENS_POR_CHAT; deslocamento += TAMANHO_DA_PAGINA_DE_MENSAGENS) {
          const pagina = await deps.client.listarMensagensDoChat(sessao.waha_session_name, chat.chatId, {
            limit: TAMANHO_DA_PAGINA_DE_MENSAGENS,
            offset: deslocamento,
            desde,
          });
          for (const bruto of pagina) {
            total.mensagensLidas += 1;
            const lido = wahaPayloadSchema.safeParse(bruto);
            const linha = lido.success ? paraLinhaDeHistorico(lido.data, chat.chatId) : null;
            if (!linha || Date.parse(linha.sent_at) < desde * 1000) continue;
            lote.push(linha);
            if (lote.length >= TAMANHO_DO_LOTE) await descarregar();
          }
          if (pagina.length < TAMANHO_DA_PAGINA_DE_MENSAGENS) break;
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("historico_lote")) throw err;
        total.falhas += 1;
        logger.warn("waha.historico: conversa nao lida", {
          organization_id: sessao.organization_id,
          detail: err instanceof Error ? err.message.slice(0, 160) : "erro",
        });
      }
    }
    if (passouDaJanela || chats.length < TAMANHO_DA_PAGINA_DE_CHATS) break;
  }
  await descarregar();
  return total;
}

export interface RitmoDasRodadas {
  primeiraEsperaMs: number;
  intervaloMs: number;
  maxRodadas: number;
  rodadasQuietasParaParar: number;
}

/** O celular despeja o histórico em minutos; 12 rodadas de 5 min cobrem ~1 h. */
export const RITMO_PADRAO: RitmoDasRodadas = {
  primeiraEsperaMs: 90_000,
  intervaloMs: 5 * 60_000,
  maxRodadas: 12,
  rodadasQuietasParaParar: 2,
};

/**
 * Roda a importação em rodadas até `rodadasQuietasParaParar` seguidas não
 * inserirem nada (o celular terminou de entregar) ou até `maxRodadas`.
 */
export async function importarEmRodadas(
  deps: { admin: SupabaseClient; client: ClienteDeHistorico; esperar?: (ms: number) => Promise<void> },
  sessao: SessaoParaImportar,
  dias: number,
  ritmo: RitmoDasRodadas = RITMO_PADRAO,
): Promise<{ rodadas: number; inseridas: number }> {
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let quietas = 0;
  let inseridas = 0;
  let rodadas = 0;
  for (; rodadas < ritmo.maxRodadas; ) {
    await esperar(rodadas === 0 ? ritmo.primeiraEsperaMs : ritmo.intervaloMs);
    rodadas += 1;
    const r = await importarHistoricoDaSessao(deps, sessao, { dias });
    inseridas += r.inseridas;
    logger.info("waha.historico: rodada", {
      organization_id: sessao.organization_id,
      channel_session_id: sessao.id,
      rodada: rodadas,
      ...r,
    });
    quietas = r.inseridas === 0 ? quietas + 1 : 0;
    if (quietas >= ritmo.rodadasQuietasParaParar) break;
  }
  return { rodadas, inseridas };
}

/** `WAHA_HISTORY_IMPORT_DAYS` como inteiro positivo; qualquer outra coisa = desligado. */
export function diasDeHistoricoDoAmbiente(valor = process.env.WAHA_HISTORY_IMPORT_DAYS): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_DIAS) : 0;
}

const EM_ANDAMENTO = new Set<string>();

/**
 * Dispara a importação em segundo plano para uma sessão recém-pareada. Devolve
 * `false` (e não faz nada) se a feature está desligada, falta WAHA/sessão, ou
 * já há uma importação desta sessão rodando neste processo.
 */
export function agendarImportacaoDeHistorico(admin: SupabaseClient, sessao: {
  id: string;
  organization_id: string;
  waha_session_name?: string | null;
}): boolean {
  const dias = diasDeHistoricoDoAmbiente();
  const client = getWahaClient();
  if (dias === 0 || !client || !sessao.waha_session_name || EM_ANDAMENTO.has(sessao.id)) return false;
  EM_ANDAMENTO.add(sessao.id);
  const alvo: SessaoParaImportar = {
    id: sessao.id,
    organization_id: sessao.organization_id,
    waha_session_name: sessao.waha_session_name,
  };
  void importarEmRodadas({ admin, client }, alvo, dias)
    .then((r) =>
      logger.info("waha.historico: importacao concluida", {
        organization_id: alvo.organization_id,
        channel_session_id: alvo.id,
        ...r,
      }),
    )
    .catch((err: unknown) =>
      logger.error("waha.historico: importacao abortada", {
        organization_id: alvo.organization_id,
        channel_session_id: alvo.id,
        detail: err instanceof Error ? err.message.slice(0, 200) : "erro",
      }),
    )
    .finally(() => EM_ANDAMENTO.delete(alvo.id));
  return true;
}

/** Quanto tempo depois do QR na tela um `WORKING` ainda conta como pareamento. */
const JANELA_DO_PAREAMENTO_MS = 30 * 60_000;
const QR_VISTO_EM = new Map<string, number>();

/**
 * Lê cada `session.status` do webhook e dispara a importação no PAREAMENTO:
 * `SCAN_QR_CODE` seguido de `WORKING`. Restart do WAHA vai direto a `WORKING`
 * e não dispara.
 *
 * Por que memória e não o status anterior gravado no banco: a tela de QR
 * (`/api/v1/onboarding/whatsapp/session`) e o cron `channel-health` também
 * gravam `channel_sessions.status`, e qualquer um deles pode escrever `WORKING`
 * antes de o webhook chegar — a virada sumiria. A sequência de webhooks de UMA
 * sessão não sofre essa corrida.
 */
export function registrarStatusParaHistorico(
  admin: SupabaseClient,
  sessao: { id: string; organization_id: string; waha_session_name?: string | null },
  status: string,
  agora: number = Date.now(),
): boolean {
  if (status === "SCAN_QR_CODE") {
    QR_VISTO_EM.set(sessao.id, agora);
    return false;
  }
  if (status !== "WORKING") return false;
  const visto = QR_VISTO_EM.get(sessao.id);
  if (visto === undefined) return false;
  QR_VISTO_EM.delete(sessao.id);
  if (agora - visto > JANELA_DO_PAREAMENTO_MS) return false;
  return agendarImportacaoDeHistorico(admin, sessao);
}
