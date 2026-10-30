/**
 * A bolha otimista de ponta a ponta no cliente: a fila, o cache da conversa e
 * a resposta do servidor. O upload e o POST são falsos; o React Query e a fila
 * são os de verdade.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/types";
import type { Message } from "@/lib/types/messaging";

const subirMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/messaging/media/subir-midia", () => ({ subirMidia: (a: unknown) => subirMock(a) }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: (...a: unknown[]) => postMock(...a) },
}));

import { useEnviosDeMidia } from "./useEnviosDeMidia";

const SUBIDO = {
  storage_path: "org/conv-1/a.jpg",
  media_mime: "image/jpeg",
  media_size_bytes: 3,
  kind: "image",
};

function montar(conversationId = "conv-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData<InfiniteData<{ data: Message[] }>>(["messages", conversationId], {
    pages: [{ data: [] }],
    pageParams: [undefined],
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const r = renderHook(() => useEnviosDeMidia(conversationId), { wrapper });
  return { ...r, qc };
}

const arquivo = () => new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });

describe("useEnviosDeMidia", () => {
  beforeEach(() => {
    subirMock.mockReset();
    postMock.mockReset();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:previa");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a bolha aparece no mesmo tique do clique, ANTES de o upload terminar", () => {
    subirMock.mockReturnValue(new Promise(() => {}));
    // Conversa PRÓPRIA: este upload nunca termina, e os envios de uma conversa saem
    // em série. Dividir "conv-1" com os outros casos deixaria todos presos atrás dele.
    const { result } = montar("conv-upload-pendente");

    act(() =>
      result.current.enviar({
        conversationId: "conv-upload-pendente",
        arquivo: arquivo(),
        legenda: "oi",
      }),
    );

    expect(result.current.pendentes).toHaveLength(1);
    expect(result.current.pendentes[0]).toMatchObject({
      fase: "enviando",
      legenda: "oi",
      previa: "blob:previa",
    });
    result.current.descartar(result.current.pendentes[0]!.id);
  });

  it("no sucesso, a linha real entra no cache e a bolha local sai (sem duplicar)", async () => {
    subirMock.mockResolvedValue(SUBIDO);
    postMock.mockResolvedValue({ data: { id: "msg-real" } });
    const { result, qc } = montar();

    act(() => result.current.enviar({ conversationId: "conv-1", arquivo: arquivo(), legenda: "" }));

    await waitFor(() => expect(result.current.pendentes).toHaveLength(0));
    const cache = qc.getQueryData<InfiniteData<{ data: Message[] }>>(["messages", "conv-1"]);
    expect(cache?.pages[0]!.data.map((m) => m.id)).toEqual(["msg-real"]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:previa");
    // A chave do POST é o id da bolha, e o prazo não é o de 30s do apiClient.
    const [, corpo, opts] = postMock.mock.calls[0]!;
    expect(opts.idempotencyKey).toBe(
      (corpo as { metadata: { envio_local: string } }).metadata.envio_local,
    );
    expect(opts.timeoutMs).toBeGreaterThan(30_000);
  });

  it("⭐ dois anexos da MESMA conversa saem em ordem: o POST do 2º espera o do 1º, mesmo com o upload do 1º mais lento", async () => {
    // [imagem, áudio] com a imagem subindo devagar: sem série, o áudio chegava ao
    // servidor primeiro e o cliente o recebia antes da imagem (spec e2e
    // `respostas-rapidas-conteudos`).
    let liberarImagem!: (u: typeof SUBIDO) => void;
    subirMock
      .mockReturnValueOnce(new Promise((resolve) => (liberarImagem = resolve)))
      .mockResolvedValueOnce({ ...SUBIDO, kind: "audio", storage_path: "org/conv-ordem/b.ogg" });
    postMock.mockResolvedValue({ data: { id: "msg" } });
    const { result } = montar("conv-ordem");

    act(() => {
      result.current.enviar({ conversationId: "conv-ordem", arquivo: arquivo(), legenda: "foto" });
      result.current.enviar({ conversationId: "conv-ordem", arquivo: arquivo(), legenda: "" });
    });

    // A imagem começou a subir; o áudio NÃO: está atrás dela.
    await waitFor(() => expect(subirMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(subirMock).toHaveBeenCalledTimes(1);
    expect(postMock).not.toHaveBeenCalled();

    liberarImagem({ ...SUBIDO, storage_path: "org/conv-ordem/a.jpg" });
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));
    const tipos = postMock.mock.calls.map(([, corpo]) => (corpo as { type: string }).type);
    expect(tipos).toEqual(["image", "audio"]);
  });

  it("falha no POST: a bolha fica com o motivo, o arquivo e a legenda; tentar de novo não sobe outra vez", async () => {
    subirMock.mockResolvedValue(SUBIDO);
    postMock.mockRejectedValueOnce(
      new ApiError(503, "internal_error", undefined, "", "Servidor indisponível"),
    );
    postMock.mockResolvedValueOnce({ data: { id: "msg-real" } });
    const { result } = montar();

    act(() =>
      result.current.enviar({ conversationId: "conv-1", arquivo: arquivo(), legenda: "orçamento" }),
    );
    await waitFor(() => expect(result.current.pendentes[0]?.fase).toBe("falhou"));
    const falhou = result.current.pendentes[0]!;
    expect(falhou).toMatchObject({
      erro: "Servidor indisponível",
      legenda: "orçamento",
      subido: SUBIDO,
    });

    act(() => result.current.tentarDeNovo(falhou.id));
    await waitFor(() => expect(result.current.pendentes).toHaveLength(0));
    expect(subirMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[1]![2].idempotencyKey).toBe(falhou.id);
  });

  it("falha de rede sem ApiError ganha um motivo legível", async () => {
    subirMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = montar();

    act(() => result.current.enviar({ conversationId: "conv-1", arquivo: arquivo(), legenda: "" }));
    await waitFor(() => expect(result.current.pendentes[0]?.fase).toBe("falhou"));
    expect(result.current.pendentes[0]!.erro).toBe("Não foi possível enviar. Verifique a conexão.");
    expect(postMock).not.toHaveBeenCalled();
    result.current.descartar(result.current.pendentes[0]!.id);
  });

  it("outra conversa não vê a bolha", () => {
    subirMock.mockReturnValue(new Promise(() => {}));
    const { result } = montar("conv-2");
    act(() => result.current.enviar({ conversationId: "conv-9", arquivo: arquivo(), legenda: "" }));
    expect(result.current.pendentes).toHaveLength(0);
  });
});
