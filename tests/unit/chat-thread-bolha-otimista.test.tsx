import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { novoEnvio, type EnvioDeMidia } from "@/lib/messaging/media/envio-otimista";
import type { Message } from "@/lib/types/messaging";

/**
 * A BOLHA OTIMISTA NO FIO DA CONVERSA.
 *
 * O que se mede é o que o atendente vê: a bolha local aparece no fim do fio
 * enquanto o anexo não virou linha, e SOME quando a linha real com a marca
 * dela (`metadata.envio_local`) chega — pela resposta do POST ou pelo
 * Realtime. Sem a segunda metade, o mesmo anexo apareceria duas vezes.
 */

const estado = vi.hoisted(() => ({
  mensagens: [] as unknown[],
  pendentes: [] as unknown[],
  descartar: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("@/hooks/inbox/useMessagesRealtime", () => ({
  useMessagesRealtime: () => ({
    data: { pages: [{ data: estado.mensagens }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/inbox/useEnviosDeMidia", () => ({
  useEnviosDeMidia: () => ({
    pendentes: estado.pendentes,
    enviar: vi.fn(),
    tentarDeNovo: vi.fn(),
    descartar: estado.descartar,
  }),
}));
vi.mock("@/hooks/inbox/useConversationNotes", () => ({ useConversationNotes: () => [] }));
vi.mock("@/hooks/inbox/usePassagensDaConversa", () => ({ usePassagensDaConversa: () => [] }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useDeleteNote", () => ({ useDeleteNote: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/ai/useDebugToggle", () => ({ useDebugToggle: () => ({ enabled: false }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ role: "agent" }),
  useUser: () => ({ id: "u-1" }),
}));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/components/inbox/NoteCard", () => ({ NoteCard: () => null }));
vi.mock("@/components/inbox/PassagemCard", () => ({ PassagemCard: () => null }));

import { ChatThread } from "@/components/inbox/ChatThread";

function msg(id: string, over: Partial<Message> = {}): Message {
  return {
    id,
    organization_id: "o1",
    conversation_id: "c-1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: null,
    type: "text",
    direction: "outbound",
    status: "sent",
    ack: null,
    error_code: null,
    error_message: null,
    body: "oi",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "user",
    sent_by_user_id: "u-1",
    sent_at: "2026-10-14T12:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: null,
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: "2026-10-14T12:00:00.000Z",
    ...over,
  } as Message;
}

function envio(id: string, over: Partial<EnvioDeMidia> = {}): EnvioDeMidia {
  return {
    ...novoEnvio({
      id,
      conversationId: "c-1",
      arquivo: new File([new Uint8Array([1])], "proposta.pdf", { type: "application/pdf" }),
      legenda: "segue",
      previa: null,
      agora: "2026-10-14T12:01:00.000Z",
    }),
    ...over,
  };
}

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const original = Element.prototype.scrollIntoView;

describe("ChatThread — bolha otimista do anexo", () => {
  beforeEach(() => {
    qc = new QueryClient();
    Element.prototype.scrollIntoView = vi.fn();
    estado.mensagens = [];
    estado.pendentes = [];
    estado.descartar.mockClear();
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it("o anexo que ainda não virou linha aparece no fim do fio", () => {
    estado.mensagens = [msg("m-1")];
    estado.pendentes = [envio("k-1")];
    render(<ChatThread conversationId="c-1" />, { wrapper });

    const bolhas = [
      ...document.querySelectorAll(
        '[data-testid="message-bubble"], [data-testid="bolha-de-envio-local"]',
      ),
    ];
    expect(bolhas.map((b) => b.getAttribute("data-testid"))).toEqual([
      "message-bubble",
      "bolha-de-envio-local",
    ]);
    expect(screen.getByText("proposta.pdf")).toBeInTheDocument();
  });

  it("conversa sem mensagens ainda mostra a bolha, não o 'Nenhuma mensagem'", () => {
    estado.pendentes = [envio("k-1")];
    render(<ChatThread conversationId="c-1" />, { wrapper });

    expect(screen.getByTestId("bolha-de-envio-local")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma mensagem nesta conversa.")).not.toBeInTheDocument();
  });

  it("chegou a linha real com a marca da bolha: a local some — o anexo não aparece em dobro", () => {
    estado.mensagens = [
      msg("m-real", { type: "document", body: "segue", metadata: { envio_local: "k-1" } }),
    ];
    estado.pendentes = [envio("k-1")];
    render(<ChatThread conversationId="c-1" />, { wrapper });

    expect(screen.queryByTestId("bolha-de-envio-local")).not.toBeInTheDocument();
    expect(estado.descartar).not.toHaveBeenCalled();
  });

  it("a bolha dizia 'não enviada', mas o servidor gravou: sai da fila (sem retentativa para o que já existe)", () => {
    estado.mensagens = [msg("m-real", { metadata: { envio_local: "k-1" } })];
    estado.pendentes = [envio("k-1", { fase: "falhou", erro: "Tempo esgotado" })];
    render(<ChatThread conversationId="c-1" />, { wrapper });

    expect(screen.queryByTestId("bolha-de-envio-local")).not.toBeInTheDocument();
    expect(estado.descartar).toHaveBeenCalledWith("k-1");
  });
});
