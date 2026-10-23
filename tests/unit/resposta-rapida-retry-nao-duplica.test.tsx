/**
 * Resposta rápida com imagem (#2526): o retry depois de uma falha parcial e a
 * remoção de imagem na prévia.
 *
 * O caso (1) nasceu como reprodução na triagem do PR #2704: num template com
 * 2 imagens, a 2ª falhava no upload e o operador clicava Enviar de novo. A 1ª
 * imagem saía DE NOVO, com a legenda — dois envios com o mesmo texto, o que a
 * issue proíbe ("falha no envio da mídia não causa duplicação do texto").
 *
 * No fork a resposta envia pela BOLHA OTIMISTA (`useEnviosDeMidia`): o diálogo
 * fecha na hora e cada arquivo vira a sua bolha, com retry próprio ("Tentar de
 * novo") que reenvia só aquele arquivo. A garantia passa a ser decidida na
 * entrega à fila: um `enviar` por arquivo, e SÓ o primeiro leva a legenda — então
 * o retry de uma bolha nunca repete o texto nem reenvia as outras.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMock = vi.fn();
const sendMock = vi.fn();
const enviarMock = vi.fn();

vi.mock("@/hooks/inbox/useEnviosDeMidia", () => ({
  useEnviosDeMidia: () => ({ pendentes: [], enviar: enviarMock, tentarDeNovo: vi.fn(), descartar: vi.fn() }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({
    data: [
      {
        id: "tpl-1",
        title: "Catalogo",
        body: "Veja o modelo",
        shortcut: "cat",
        owner_user_id: null,
        midias: [
          { storage_path: "o/templates/tpl-1/a.jpg", media_mime: "image/jpeg", media_size_bytes: 3 },
          { storage_path: "o/templates/tpl-1/b.jpg", media_mime: "image/jpeg", media_size_bytes: 3 },
        ],
      },
    ],
  }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  usePermission: () => true,
  // A escolha de contato do Composer lê o país da organização (o exemplo do telefone); sem organização, o Brasil.
  usePaisDaOrgAtiva: () => null,
}));

import { Composer } from "@/components/inbox/Composer";

async function escolherTemplate() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "/cat" } });
  // O título aparece duas vezes desde a barra de recursos (#2833): no menu do `/`
  // e no botão da barra. Este teste é sobre o `/`, então procura só no menu.
  fireEvent.click(await within(await screen.findByRole("listbox")).findByText("Catalogo"));
  await screen.findByRole("dialog");
}

const enviar = () => fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));
const entregues = () =>
  enviarMock.mock.calls.map(([v]) => {
    const { arquivo, legenda } = v as { arquivo: File; legenda: string };
    return [arquivo.name, legenda];
  });

beforeEach(() => {
  uploadMock.mockClear();
  sendMock.mockClear();
  enviarMock.mockClear();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  })) as never;
});

describe("resposta rápida com imagem — fila por bolha e remoção na prévia (#2526)", () => {
  it("(1) duas imagens: uma bolha por arquivo, e só a 1ª leva a legenda (o retry de uma bolha não repete o texto)", async () => {
    await escolherTemplate();

    enviar();

    await waitFor(() => expect(enviarMock).toHaveBeenCalledTimes(2));
    expect(entregues()).toEqual([
      ["a.jpg", "Veja o modelo"],
      ["b.jpg", ""],
    ]);
    // O envio saiu da fila de dentro do diálogo: ele fecha na hora, sem upload nem POST aqui.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(uploadMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("(2) remover a 1ª imagem na prévia: só a 2ª sai, levando a legenda", async () => {
    await escolherTemplate();

    fireEvent.click(screen.getAllByRole("button", { name: /remover imagem/i })[0]!);
    expect(screen.getAllByRole("button", { name: /remover imagem/i })).toHaveLength(1);
    enviar();

    await waitFor(() => expect(enviarMock).toHaveBeenCalledTimes(1));
    expect(entregues()).toEqual([["b.jpg", "Veja o modelo"]]);
  });

  it("(3) remover todas: a prévia fecha e o texto volta para o campo, sem envio", async () => {
    await escolherTemplate();

    fireEvent.click(screen.getAllByRole("button", { name: /remover imagem/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /remover imagem/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Veja o modelo");
    expect(enviarMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
