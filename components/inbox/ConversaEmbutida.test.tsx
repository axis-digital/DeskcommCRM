import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado: { data: unknown; error: unknown; isLoading: boolean } = { data: null, error: null, isLoading: false };
const envio = { motivoDaJanela: null as string | null, blockedReason: null as string | null, fechada: false, somenteLeitura: false };
const marcarComoLida = vi.fn();

vi.mock("@/hooks/inbox/useConversation", () => ({
  useConversation: () => estado,
  isNotFound: (e: unknown) => (e as { status?: number })?.status === 404,
}));
vi.mock("@/hooks/inbox/useEnvioDaConversa", () => ({ useEnvioDaConversa: () => envio }));
vi.mock("@/hooks/inbox/useMarkAsRead", () => ({
  useMarkAsRead: (id: string | null, unread: number) => marcarComoLida(id, unread),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
// A thread de mentira só oferece o gesto "responder a esta mensagem".
vi.mock("./ChatThread", () => ({
  ChatThread: ({ onResponder }: { onResponder?: (m: { id: string }) => void }) => (
    <button type="button" data-testid="thread" onClick={() => onResponder?.({ id: "msg-da-conversa-a" })}>
      responder
    </button>
  ),
}));
// O composer de mentira repete só o contrato que importa aqui: nasce com
// `initialDraft`/`initialMode`, avisa cada mudança em `onDraftChange` e expõe o
// que recebeu — como o real.
vi.mock("./Composer", () => ({
  Composer: ({
    initialDraft,
    initialMode,
    onDraftChange,
    respondendo,
    blockedReason,
    janelaFechada,
    disabled,
  }: {
    initialDraft?: string;
    initialMode?: "reply" | "note";
    onDraftChange?: (t: string, m: "reply" | "note") => void;
    respondendo?: { id: string } | null;
    blockedReason?: string | null;
    janelaFechada?: string | null;
    disabled?: boolean;
  }) => (
    <textarea
      data-testid="composer"
      data-modo={initialMode ?? "reply"}
      data-respondendo={respondendo?.id ?? ""}
      data-bloqueio={blockedReason ?? ""}
      data-janela={janelaFechada ?? ""}
      data-desabilitado={String(Boolean(disabled))}
      defaultValue={initialDraft}
      onChange={(e) => onDraftChange?.(e.target.value, e.target.dataset.modoDigitado === "note" ? "note" : "reply")}
    />
  ),
}));
vi.mock("./RetentionNotice", () => ({ RetentionNotice: () => null }));
vi.mock("@/components/inbox/JanelaFechadaAviso", () => ({ JanelaFechadaAviso: () => null }));
vi.mock("@/components/inbox/NumeroForaDoAr", () => ({ NumeroForaDoAr: () => null }));

import { ConversaEmbutida, rascunhoEmbutido } from "./ConversaEmbutida";

const conversa = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  contact_id: "k1",
  contacts: { id: "k1" },
  channel_sessions: null,
  ...extra,
});
const carrega = (c: unknown) => Object.assign(estado, { data: c, error: null, isLoading: false });

describe("ConversaEmbutida", () => {
  beforeEach(() => {
    Object.assign(envio, { motivoDaJanela: null, blockedReason: null, fechada: false, somenteLeitura: false });
    marcarComoLida.mockClear();
  });

  it("monta a thread e o composer da Inbox", () => {
    carrega(conversa("c1"));
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByTestId("thread")).toBeInTheDocument();
    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });

  it("as guardas de envio da fonte única chegam ao composer (janela, bloqueio, conversa fechada)", () => {
    Object.assign(envio, { motivoDaJanela: "A janela fechou", blockedReason: "Contato bloqueado", fechada: true });
    carrega(conversa("c1"));
    render(<ConversaEmbutida conversationId="c1" />);
    const composer = screen.getByTestId("composer");
    expect(composer).toHaveAttribute("data-janela", "A janela fechou");
    expect(composer).toHaveAttribute("data-bloqueio", "Contato bloqueado");
    expect(composer).toHaveAttribute("data-desabilitado", "true");
  });

  it("a citação escolhida numa conversa NÃO vai para a outra quando o painel troca de conversa", () => {
    carrega(conversa("c-a"));
    const { rerender } = render(<ConversaEmbutida conversationId="c-a" />);
    fireEvent.click(screen.getByTestId("thread"));
    expect(screen.getByTestId("composer")).toHaveAttribute("data-respondendo", "msg-da-conversa-a");

    carrega(conversa("c-b"));
    rerender(<ConversaEmbutida conversationId="c-b" />);

    expect(screen.getByTestId("composer")).toHaveAttribute("data-respondendo", "");
  });

  it("ler a conversa no dossiê a marca como lida, como a Inbox faz", () => {
    carrega(conversa("c-lida", { unread_count_for_assignee: 3 }));
    render(<ConversaEmbutida conversationId="c-lida" />);
    expect(marcarComoLida).toHaveBeenCalledWith("c-lida", 3);
  });

  it("conversa fora do acesso: diz por quê e não monta o composer", () => {
    Object.assign(estado, { data: null, error: { status: 404 }, isLoading: false });
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByText("Conversa não encontrada ou fora do seu acesso.")).toBeVisible();
    expect(screen.queryByTestId("composer")).toBeNull();
  });

  it("o rascunho pela metade volta quando o dossiê é fechado e reaberto", () => {
    carrega(conversa("c-rasc"));
    const primeira = render(<ConversaEmbutida conversationId="c-rasc" />);
    fireEvent.change(screen.getByTestId("composer"), { target: { value: "Olá, tudo be" } });
    primeira.unmount();

    render(<ConversaEmbutida conversationId="c-rasc" />);

    expect(screen.getByTestId("composer")).toHaveValue("Olá, tudo be");
    expect(screen.getByTestId("composer")).toHaveAttribute("data-modo", "reply");
  });

  it("uma NOTA interna pela metade volta como nota — nunca vira mensagem para o cliente", () => {
    carrega(conversa("c-nota"));
    const primeira = render(<ConversaEmbutida conversationId="c-nota" />);
    const campo = screen.getByTestId("composer");
    campo.dataset.modoDigitado = "note";
    fireEvent.change(campo, { target: { value: "Cliente pediu desconto, ver com a gerência" } });
    primeira.unmount();

    render(<ConversaEmbutida conversationId="c-nota" />);

    expect(screen.getByTestId("composer")).toHaveValue("Cliente pediu desconto, ver com a gerência");
    expect(screen.getByTestId("composer")).toHaveAttribute("data-modo", "note");
  });

  it("apagar o campo apaga o rascunho: o texto velho não ressuscita ao reabrir", () => {
    carrega(conversa("c-apagado"));
    const primeira = render(<ConversaEmbutida conversationId="c-apagado" />);
    fireEvent.change(screen.getByTestId("composer"), { target: { value: "Olá" } });
    fireEvent.change(screen.getByTestId("composer"), { target: { value: "" } });
    primeira.unmount();

    expect(rascunhoEmbutido("c-apagado")).toBe("");
    render(<ConversaEmbutida conversationId="c-apagado" />);
    expect(screen.getByTestId("composer")).toHaveValue("");
  });

  it("o rascunho é da conversa: outra conversa nasce com o campo vazio", () => {
    carrega(conversa("c-outra"));
    render(<ConversaEmbutida conversationId="c-outra" />);
    expect(screen.getByTestId("composer")).toHaveValue("");
  });

  it("falha que não é 404: diz que não carregou, sem culpar o acesso", () => {
    Object.assign(estado, { data: null, error: { status: 500 }, isLoading: false });
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByText("Não foi possível carregar a conversa.")).toBeVisible();
    expect(screen.queryByTestId("composer")).toBeNull();
  });

  it("carregando: estado acessível, sem composer", () => {
    Object.assign(estado, { data: null, error: null, isLoading: true });
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("composer")).toBeNull();
  });
});
