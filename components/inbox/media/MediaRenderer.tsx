"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import {
  CHAVE_TRANSCRICAO_SOLICITADA_EM,
  falhaDeTranscricaoParaPessoa,
  MARCADOR_NAO_LIDA,
} from "@/lib/messaging/media/derivable";
import type { Message } from "@/lib/types/messaging";

import { AudioPlayer } from "./AudioPlayer";
import { DocumentCard } from "./DocumentCard";
import { ImageMedia } from "./ImageMedia";
import { nomeOriginalDoDocumento } from "./media-utils";
import { StickerMedia } from "./StickerMedia";
import { VideoMedia } from "./VideoMedia";

const TETO_AVISO_TRANSCREVENDO_MS = 10 * 60_000;
type Resultado = { status: string; text?: string | null; message?: string | null };

function TranscricaoDoAudio({ message, agora }: { message: Message; agora: number }) {
  const t = useT();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const trava = useRef(false);
  const podePedir =
    Boolean(message.media_storage_path) &&
    !message.revoked_at &&
    message.metadata?.media_status !== "expired";
  const textoGravado = message.media_derived_text?.trim();
  const texto =
    resultado?.status === "ready" && podePedir
      ? resultado.text
      : message.media_derived_status === "ready" && textoGravado !== MARCADOR_NAO_LIDA
        ? textoGravado
        : null;
  const pedidoEm = message.metadata?.[CHAVE_TRANSCRICAO_SOLICITADA_EM];
  const pedidoRecente =
    typeof pedidoEm === "string" && agora - Date.parse(pedidoEm) < TETO_AVISO_TRANSCREVENDO_MS;
  const pendente =
    podePedir &&
    !texto &&
    (pedindo ||
      resultado?.status === "pending" ||
      (!resultado && pedidoRecente && !message.media_derived_status));
  const erro =
    resultado?.status === "failed"
      ? resultado.message
      : !resultado && message.media_derived_status === "failed"
        ? t(falhaDeTranscricaoParaPessoa(message.metadata?.media_derived_motivo))
        : null;
  const endpoint = `/api/v1/messages/${message.id}/transcription`;

  async function lerResposta(res: Response): Promise<Resultado> {
    const payload = await res.json();
    if (!res.ok)
      return {
        status: "failed",
        message:
          payload.error?.message ||
          t("Não foi possível pedir a transcrição agora. Tente novamente."),
      };
    return payload.data;
  }

  async function pedir() {
    if (trava.current) return;
    trava.current = true;
    setPedindo(true);
    setResultado(null);
    try {
      setResultado(
        await lerResposta(
          await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(20_000) }),
        ),
      );
    } catch {
      setResultado({
        status: "failed",
        message: t("Não foi possível pedir a transcrição agora. Tente novamente."),
      });
    } finally {
      trava.current = false;
      setPedindo(false);
    }
  }

  useEffect(() => {
    if (!pendente || pedindo) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const inicio = Date.now();
    const mensagem = t("A transcrição está demorando. Tente novamente para verificar o resultado.");
    async function consultar() {
      try {
        const res = await fetch(endpoint, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error?.message || mensagem);
        const proximo = payload.data as Resultado;
        if (proximo.status !== "pending") setResultado(proximo);
        else if (Date.now() - inicio >= TETO_AVISO_TRANSCREVENDO_MS)
          setResultado({ status: "failed", message: mensagem });
        else timer = setTimeout(() => void consultar(), 2_000);
      } catch {
        if (!controller.signal.aborted) setResultado({ status: "failed", message: mensagem });
      }
    }
    timer = setTimeout(() => void consultar(), 2_000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, pedindo, pendente, t]);

  if (texto)
    return (
      <>
        <span
          data-testid="rotulo-transcricao"
          className="text-[10px] tracking-wide uppercase opacity-70"
        >
          {t("Transcrição")}
        </span>
        <p data-testid="transcricao-de-audio" className="text-sm leading-relaxed opacity-80">
          {texto}
        </p>
      </>
    );
  if (pendente)
    return (
      <p
        role="status"
        data-testid="transcricao-de-audio-pendente"
        className="text-sm leading-relaxed opacity-60"
      >
        {t("Transcrevendo…")}
      </p>
    );
  if (!podePedir) return null;
  return (
    <>
      {erro && (
        <p role="alert" className="text-sm leading-relaxed opacity-80">
          {erro}
        </p>
      )}
      <button
        type="button"
        onClick={() => void pedir()}
        className="self-start text-sm underline underline-offset-4"
      >
        {t(erro ? "Tentar novamente" : "Transcrever")}
      </button>
    </>
  );
}

/**
 * Dispatcher de mídia por message.type (Onda 1). Tipo com mídia mas sem
 * renderer dedicado (location/contact futuros) cai no DocumentCard —
 * sempre dá pro atendente baixar o arquivo.
 */
export function MediaRenderer({
  message,
  agora,
}: {
  message: Message;
  /** O relógio do MessageBubble (tick de 60s): é ele que tira o aviso vencido da tela. */
  agora: number;
}) {
  const t = useT();
  const isOutbound = message.direction === "outbound";
  switch (message.type) {
    case "image":
      return <ImageMedia messageId={message.id} alt={t("Imagem recebida")} />;
    case "sticker":
      return <StickerMedia messageId={message.id} />;
    case "audio": {
      return (
        <div className="flex flex-col gap-2">
          <AudioPlayer messageId={message.id} isOutbound={isOutbound} mime={message.media_mime} />
          <TranscricaoDoAudio key={message.id} message={message} agora={agora} />
        </div>
      );
    }
    case "video":
      return <VideoMedia messageId={message.id} />;
    case "contact":
      return null;
    default:
      return (
        <DocumentCard
          messageId={message.id}
          mime={message.media_mime}
          sizeBytes={message.media_size_bytes}
          storagePath={message.media_storage_path}
          isOutbound={isOutbound}
          fileName={nomeOriginalDoDocumento(message.metadata)}
        />
      );
  }
}
