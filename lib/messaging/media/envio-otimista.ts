/**
 * A BOLHA OTIMISTA do envio de mídia pela Inbox.
 *
 * Antes, o Composer ficava preso enquanto o arquivo subia e o canal respondia —
 * medido em produção (2026-10-14): 5,2s para uma imagem de 1,7 MB, com o
 * diálogo de anexo aberto e o campo travado o tempo todo. Agora o clique em
 * "Enviar" põe uma bolha local na conversa e devolve o Composer na hora; o
 * upload e o POST seguem em segundo plano.
 *
 * Por que uma fila própria, e não o cache do `["messages", id]` como faz o
 * texto (`useSendMessage`): o Realtime da conversa INVALIDA esse cache a cada
 * mudança em `messages`, e o refetch substitui a lista inteira. Para o texto
 * (centenas de ms) isso não pesa; para um upload de segundos, qualquer
 * mensagem que chegasse no meio apagaria a bolha da tela. Aqui a bolha só sai
 * quando o envio dela termina.
 *
 * O que NÃO é responsabilidade desta fila: a falha do CANAL. Quando o provedor do canal
 * recusa ou estoura o prazo, o servidor grava a linha como `failed` e responde
 * 201 — a bolha real, com "Falhou", toma o lugar desta. A fila só segura o que
 * ainda não tem linha: falha no upload, ou o POST que não chegou a responder.
 */
import { kindFromMime } from "@/lib/messaging/media/upload-validation";
import type { UploadedMedia } from "@/lib/messaging/media/subir-midia";
import type { Message } from "@/lib/types/messaging";

export type FaseDoEnvio = "enviando" | "falhou";

export interface EnvioDeMidia {
  /** Identidade da bolha E a `Idempotency-Key` do POST, do primeiro clique à última retentativa. */
  readonly id: string;
  readonly conversationId: string;
  readonly arquivo: File;
  readonly legenda: string;
  readonly tipo: UploadedMedia["kind"];
  /** `blob:` da prévia (imagem/vídeo), ou null. Quem remove o envio revoga. */
  readonly previa: string | null;
  readonly fase: FaseDoEnvio;
  readonly erro: string | null;
  /** O que já subiu ao Storage — a retentativa não sobe de novo. */
  readonly subido: UploadedMedia | null;
  readonly criadoEm: string;
}

export function novoEnvio(args: {
  id: string;
  conversationId: string;
  arquivo: File;
  legenda: string;
  previa: string | null;
  agora: string;
}): EnvioDeMidia {
  return {
    id: args.id,
    conversationId: args.conversationId,
    arquivo: args.arquivo,
    legenda: args.legenda.trim(),
    // O mesmo corte do upload; mime que ele não aceita vira documento na
    // prévia — e o upload recusa em seguida, com a bolha mostrando o motivo.
    tipo: kindFromMime(args.arquivo.type) ?? "document",
    previa: args.previa,
    fase: "enviando",
    erro: null,
    subido: null,
    criadoEm: args.agora,
  };
}

type Mudanca = Partial<Pick<EnvioDeMidia, "fase" | "erro" | "subido">>;

/**
 * Armazém mínimo com assinatura — o formato que o `useSyncExternalStore` pede.
 * A lista é trocada inteira a cada mudança (nunca mutada), e é essa troca de
 * referência que faz o React perceber que algo mudou.
 */
export function criarFilaDeEnvios() {
  let envios: readonly EnvioDeMidia[] = [];
  const ouvintes = new Set<() => void>();
  const avisar = () => ouvintes.forEach((o) => o());

  return {
    todos: () => envios,
    daConversa: (lista: readonly EnvioDeMidia[], conversationId: string) =>
      lista.filter((e) => e.conversationId === conversationId),
    adicionar(envio: EnvioDeMidia) {
      envios = [...envios, envio];
      avisar();
    },
    atualizar(id: string, mudanca: Mudanca) {
      if (!envios.some((e) => e.id === id)) return;
      envios = envios.map((e) => (e.id === id ? { ...e, ...mudanca } : e));
      avisar();
    },
    remover(id: string): EnvioDeMidia | null {
      const alvo = envios.find((e) => e.id === id) ?? null;
      if (!alvo) return null;
      envios = envios.filter((e) => e.id !== id);
      avisar();
      return alvo;
    },
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}

export type FilaDeEnvios = ReturnType<typeof criarFilaDeEnvios>;

/** Espera `anterior` ou o teto, o que vier primeiro, e não deixa o timer pendurado. */
function esperarAteOTeto(anterior: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([anterior, teto]).finally(() => clearTimeout(timer));
}

/**
 * Os envios de UMA conversa saem na ordem em que foram pedidos.
 *
 * A ordem dos anexos de uma resposta rápida é parte do conteúdo: [áudio, imagem
 * com a legenda, áudio] tem de chegar nessa sequência. Cada envio é upload + POST,
 * e sem série o primeiro a chegar ao servidor é o que subiu mais rápido — a imagem
 * (maior) era ultrapassada pelo áudio seguinte e o cliente a recebia por último.
 *
 * Conversas diferentes não esperam uma pela outra. Uma tarefa que lança não trava
 * as seguintes: a série segue e o erro volta só para quem a pediu.
 *
 * A espera tem TETO. Um upload pendurado na rede nunca resolve, e sem teto travaria
 * todos os envios seguintes da conversa — antes da série só aquela bolha ficava
 * presa. Passado o teto o seguinte sai (a ordem pode se perder, como era antes);
 * o POST tem prazo próprio de 60 s e o upload demora o que a rede levar, então o
 * teto cobre o upload lento de verdade e só corta o que passou de 2 minutos.
 */
export const ESPERA_MAXIMA_DA_VEZ_MS = 120_000;

export function criarSerieDeEnvios(opcoes: { esperaMaximaMs?: number } = {}) {
  const esperaMaximaMs = opcoes.esperaMaximaMs ?? ESPERA_MAXIMA_DA_VEZ_MS;
  const caudas = new Map<string, Promise<unknown>>();
  return function naVez(conversationId: string, tarefa: () => Promise<void>): Promise<void> {
    const anterior = caudas.get(conversationId) ?? Promise.resolve();
    const atual = esperarAteOTeto(anterior, esperaMaximaMs).then(tarefa);
    // A cauda nunca rejeita: quem espera a próxima tarefa não herda o erro desta.
    const cauda = atual.catch(() => undefined);
    caudas.set(conversationId, cauda);
    // Não deixa a conversa pendurada no mapa depois que a fila esvaziou.
    void cauda.then(() => {
      if (caudas.get(conversationId) === cauda) caudas.delete(conversationId);
    });
    return atual;
  };
}

export interface CorpoDoEnvio {
  conversation_id: string;
  type: UploadedMedia["kind"];
  body?: string;
  media_storage_path: string;
  media_mime: string;
  media_size_bytes: number;
  metadata: { envio_local: string };
}

/**
 * Os envios locais que já viraram linha em `messages`.
 *
 * O POST grava o id da bolha em `metadata.envio_local`. Quando o cliente
 * desiste antes da resposta (prazo estourado, rede caída) e o servidor ainda
 * assim gravou, a linha chega pelo Realtime enquanto a bolha local diz
 * "não enviada" — sem esta marca as duas apareceriam juntas.
 */
export function idsDeEnviosGravados(mensagens: readonly Message[]): Set<string> {
  const ids = new Set<string>();
  for (const m of mensagens) {
    const marca = (m.metadata as Record<string, unknown> | null)?.envio_local;
    if (typeof marca === "string") ids.add(marca);
  }
  return ids;
}

export interface DepsDoEnvio {
  subir: (a: { conversationId: string; arquivo: File }) => Promise<UploadedMedia>;
  enviar: (corpo: CorpoDoEnvio, chave: string) => Promise<Message>;
}

export type DesfechoDoEnvio =
  { ok: true; mensagem: Message } | { ok: false; erro: unknown; subido: UploadedMedia | null };

/** Uma tentativa: sobe (se ainda não subiu) e envia com a chave do envio. Nunca lança. */
export async function executarEnvio(
  envio: EnvioDeMidia,
  deps: DepsDoEnvio,
): Promise<DesfechoDoEnvio> {
  let subido = envio.subido;
  try {
    subido ??= await deps.subir({ conversationId: envio.conversationId, arquivo: envio.arquivo });
    const mensagem = await deps.enviar(
      {
        conversation_id: envio.conversationId,
        type: subido.kind,
        ...(envio.legenda ? { body: envio.legenda } : {}),
        media_storage_path: subido.storage_path,
        media_mime: subido.media_mime,
        media_size_bytes: subido.media_size_bytes,
        metadata: { envio_local: envio.id },
      },
      envio.id,
    );
    return { ok: true, mensagem };
  } catch (erro) {
    return { ok: false, erro, subido };
  }
}
