import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaRenderer } from "@/components/inbox/media/MediaRenderer";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import type { Message } from "@/lib/types/messaging";

/**
 * A transcrição do áudio no balão do Inbox (#2133).
 *
 * O que já existia na main (#2057): `media_derived_status === "ready"` com
 * texto aparece abaixo do player. O que faltava era o meio do caminho — o
 * worker não grava "pending", a linha nasce `null` e só o worker muda, então
 * `null` é "ainda processando" (DERIVACAO_TERMINADA: ready/failed/skipped).
 * Sem isto o atendente vê o player e não sabe se vai existir texto.
 *
 * Os casos são montados como em tests/unit/inbox-media-renderer.test.tsx:
 * o balão renderizado é o MediaRenderer (dispatcher por message.type) e o
 * MessageBubble só para provar que mensagem sem áudio não muda nada.
 */
function msg(over: Partial<Message>): Message {
  return {
    id: "m1",
    conversation_id: "c1",
    contact_id: "ct1",
    channel_session_id: "s1",
    external_id: "x1",
    type: "text",
    direction: "inbound",
    status: "delivered",
    ack: null,
    body: null,
    media_url: "http://waha/file",
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: "p1",
    sent_via: "external_device",
    sent_at: "2026-10-02T20:00:00.000Z",
    delivered_at: null,
    read_at: null,
    error_code: null,
    error_message: null,
    metadata: {},
    created_at: "2026-10-02T20:00:00.000Z",
    ...over,
  } as Message;
}

// O relógio do balão é prop (o tick do MessageBubble): 30s depois de a
// mensagem chegar, dentro do teto do aviso.
const CHEGADA = Date.parse("2026-10-02T20:00:00.000Z");
const audio = (over: Partial<Message>, agora = CHEGADA + 30_000) =>
  render(<MediaRenderer message={msg({ type: "audio", ...over })} agora={agora} />);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Transcrição do áudio no balão do Inbox (#2133)", () => {
  it("derived pronto mostra a transcrição, identificada, abaixo do player", () => {
    audio({ media_derived_status: "ready", media_derived_text: "  quero agendar amanhã  " });
    expect(screen.getByTestId("transcricao-de-audio")).toHaveTextContent("quero agendar amanhã");
    expect(screen.getByTestId("rotulo-transcricao")).toHaveTextContent("Transcrição");
    const player = screen.getByRole("button", { name: /reproduzir/i });
    const texto = screen.getByTestId("transcricao-de-audio");
    // Abaixo do player: o nó do texto vem DEPOIS do player na ordem do DOM.
    expect(player.compareDocumentPosition(texto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("áudio sem pedido mostra Transcrever e não chama o serviço ao abrir a conversa", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    audio({ media_derived_status: null, media_derived_text: null });
    expect(screen.getByRole("button", { name: "Transcrever" })).toBeEnabled();
    expect(screen.queryByTestId("transcricao-de-audio-pendente")).not.toBeInTheDocument();
    expect(screen.queryByTestId("transcricao-de-audio")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("só o clique pede a transcrição; clique repetido não duplica o pedido", async () => {
    const fetch = vi.fn((_input: string, _init?: RequestInit) => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    audio({ media_derived_status: null });
    const botao = screen.getByRole("button", { name: "Transcrever" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/v1/messages/m1/transcription");
    expect(screen.getByTestId("transcricao-de-audio-pendente")).toHaveTextContent("Transcrevendo…");
  });

  it("a recusa do servidor aparece e permite tentar novamente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: "Confira o saldo do serviço de transcrição." },
            }),
            { status: 402 },
          ),
      ),
    );
    audio({ media_derived_status: null });
    fireEvent.click(screen.getByRole("button", { name: "Transcrever" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confira o saldo");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeEnabled();
  });

  it("o texto retornado pelo pedido aparece sem precisar reabrir a conversa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: { status: "ready", text: "Quero marcar uma reunião." },
            }),
          ),
      ),
    );
    audio({ media_derived_status: null });
    fireEvent.click(screen.getByRole("button", { name: "Transcrever" }));
    expect(await screen.findByTestId("transcricao-de-audio")).toHaveTextContent(
      "Quero marcar uma reunião.",
    );
  });

  it("a resposta local é descartada quando a anonimização remove a mídia da mensagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: { status: "ready", text: "Texto que será removido" } }),
          ),
      ),
    );
    const view = audio({ media_derived_status: null });
    fireEvent.click(screen.getByRole("button", { name: "Transcrever" }));
    expect(await screen.findByTestId("transcricao-de-audio")).toBeVisible();
    view.rerender(
      <MediaRenderer
        agora={CHEGADA + 30_000}
        message={msg({
          type: "audio",
          media_storage_path: null,
          media_derived_status: null,
          media_derived_text: null,
        })}
      />,
    );
    expect(screen.queryByTestId("transcricao-de-audio")).not.toBeInTheDocument();
  });

  it("acompanha a fila depois do clique e mostra o resultado concluído pelo worker", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { status: "pending" } }), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "ready", text: "Texto concluído pelo worker" } }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    audio({ media_derived_status: null });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transcrever" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Transcrevendo…");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByTestId("transcricao-de-audio")).toHaveTextContent(
      "Texto concluído pelo worker",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("áudio que já falhou mostra o motivo em linguagem de atendimento", () => {
    audio({
      media_derived_status: "failed",
      metadata: { media_derived_motivo: "transcription_402" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/saldo|crédito|cobrança/i);
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeEnabled();
  });

  it("áudio do composer (outbound, sent_via crm) não promete transcrição: a ingestão nunca a pede", () => {
    audio({
      direction: "outbound",
      sent_via: "crm",
      media_derived_status: null,
      media_derived_text: null,
    });
    expect(screen.queryByTestId("transcricao-de-audio-pendente")).not.toBeInTheDocument();
  });

  it("áudio recebido há 10 min ainda sem status não sustenta o aviso para sempre", () => {
    audio({ media_derived_status: null, media_derived_text: null }, CHEGADA + 10 * 60_000);
    expect(screen.queryByTestId("transcricao-de-audio-pendente")).not.toBeInTheDocument();
  });

  it("controle — status final falho não mostra nem transcrição nem carregamento", () => {
    audio({
      media_derived_status: "failed",
      media_derived_text: "[o cliente enviou uma mídia que não consegui interpretar]",
    });
    expect(screen.queryByTestId("transcricao-de-audio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("transcricao-de-audio-pendente")).not.toBeInTheDocument();
  });

  it("controle — mensagem sem áudio não ganha bloco nenhum de transcrição", () => {
    render(
      <MessageBubble message={msg({ type: "text", body: "oi, tudo bem", media_url: null })} />,
    );
    expect(screen.getByText("oi, tudo bem")).toBeInTheDocument();
    expect(document.querySelector('[data-testid^="transcricao"]')).toBeNull();
    expect(document.querySelector('[data-testid="rotulo-transcricao"]')).toBeNull();
  });
});
