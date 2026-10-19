import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const estado: { data: unknown; error: unknown; isLoading: boolean } = { data: null, error: null, isLoading: false };
vi.mock("@/hooks/inbox/useConversation", () => ({
  useConversation: () => estado,
  isNotFound: (e: unknown) => (e as { status?: number })?.status === 404,
}));
vi.mock("@/hooks/inbox/useEnvioDaConversa", () => ({
  useEnvioDaConversa: () => ({ motivoDaJanela: null, blockedReason: null, fechada: false, somenteLeitura: false }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("./ChatThread", () => ({ ChatThread: () => <div data-testid="thread" /> }));
// O composer de mentira repete só o contrato que importa aqui: nasce com
// `initialDraft` e avisa cada mudança em `onDraftChange`, como o real.
vi.mock("./Composer", () => ({
  Composer: ({
    initialDraft,
    onDraftChange,
  }: {
    initialDraft?: string;
    onDraftChange?: (t: string, m: "reply" | "note") => void;
  }) => (
    <textarea
      data-testid="composer"
      defaultValue={initialDraft}
      onChange={(e) => onDraftChange?.(e.target.value, "reply")}
    />
  ),
}));
vi.mock("./RetentionNotice", () => ({ RetentionNotice: () => null }));
vi.mock("@/components/inbox/JanelaFechadaAviso", () => ({ JanelaFechadaAviso: () => null }));
vi.mock("@/components/inbox/NumeroForaDoAr", () => ({ NumeroForaDoAr: () => null }));

import { ConversaEmbutida } from "./ConversaEmbutida";

describe("ConversaEmbutida", () => {
  it("monta a thread e o composer da Inbox", () => {
    Object.assign(estado, { data: { id: "c1", contacts: { id: "k1" }, channel_sessions: null }, error: null, isLoading: false });
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByTestId("thread")).toBeInTheDocument();
    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });

  it("conversa fora do acesso: diz por quê e não monta o composer", () => {
    Object.assign(estado, { data: null, error: { status: 404 }, isLoading: false });
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByText("Conversa não encontrada ou fora do seu acesso.")).toBeVisible();
    expect(screen.queryByTestId("composer")).toBeNull();
  });

  it("o rascunho pela metade volta quando o dossiê é fechado e reaberto", () => {
    Object.assign(estado, { data: { id: "c-rasc", contacts: { id: "k1" }, channel_sessions: null }, error: null, isLoading: false });
    const primeira = render(<ConversaEmbutida conversationId="c-rasc" />);
    fireEvent.change(screen.getByTestId("composer"), { target: { value: "Olá, tudo be" } });
    primeira.unmount();

    render(<ConversaEmbutida conversationId="c-rasc" />);

    expect(screen.getByTestId("composer")).toHaveValue("Olá, tudo be");
  });

  it("o rascunho é da conversa: outra conversa nasce com o campo vazio", () => {
    Object.assign(estado, { data: { id: "c-outra", contacts: { id: "k2" }, channel_sessions: null }, error: null, isLoading: false });
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
