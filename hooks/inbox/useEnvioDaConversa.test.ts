import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { CHANNEL_PROVIDER_META, CHANNEL_PROVIDER_WAHA } from "@/lib/channels/capabilities";
import { useEnvioDaConversa } from "./useEnvioDaConversa";

const usuario = { support: null as null | { access_mode: string } };
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => ({ user: usuario }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

const DIA_MS = 24 * 60 * 60 * 1000;

const conversa = (over: Record<string, unknown> = {}) =>
  ({
    id: "c1",
    status: "open",
    last_inbound_at: new Date().toISOString(),
    channel_sessions: { provider: CHANNEL_PROVIDER_META },
    contacts: { id: "k1", is_blocked: false },
    ...over,
  }) as unknown as ConversationWithContact;

describe("useEnvioDaConversa", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    usuario.support = null;
  });

  it("conversa aberta, dentro da janela: nada bloqueia", () => {
    const { result } = renderHook(() => useEnvioDaConversa(conversa()));
    expect(result.current).toMatchObject({
      motivoDaJanela: null,
      blockedReason: null,
      fechada: false,
      somenteLeitura: false,
    });
  });

  it("a janela de 24h fecha sozinha com o relógio, sem recarregar", () => {
    // A conversa é criada UMA vez: recriá-la a cada render moveria o
    // `last_inbound_at` junto com o relógio falso e a janela nunca venceria.
    const c = conversa();
    const { result } = renderHook(() => useEnvioDaConversa(c));
    expect(result.current.motivoDaJanela).toBeNull();
    act(() => {
      vi.advanceTimersByTime(DIA_MS + 31_000);
    });
    expect(result.current.motivoDaJanela).not.toBeNull();
  });

  it("canal sem janela (texto livre a qualquer hora) nunca fecha por tempo", () => {
    const antiga = new Date(Date.now() - 10 * DIA_MS).toISOString();
    const { result } = renderHook(() =>
      useEnvioDaConversa(
        conversa({ last_inbound_at: antiga, channel_sessions: { provider: CHANNEL_PROVIDER_WAHA } }),
      ),
    );
    expect(result.current.motivoDaJanela).toBeNull();
  });

  it("contato bloqueado desabilita com o motivo do contato", () => {
    const { result } = renderHook(() =>
      useEnvioDaConversa(conversa({ contacts: { id: "k1", is_blocked: true } })),
    );
    expect(result.current.blockedReason).toBe("Contato bloqueado — envio de mensagens desabilitado.");
  });

  it("suporte somente-leitura bloqueia com o motivo próprio, acima do contato", () => {
    usuario.support = { access_mode: "support_readonly" };
    const { result } = renderHook(() =>
      useEnvioDaConversa(conversa({ contacts: { id: "k1", is_blocked: true } })),
    );
    expect(result.current.blockedReason).toBe("Acompanhamento somente leitura");
    expect(result.current.somenteLeitura).toBe(true);
  });

  it("conversa fechada desabilita", () => {
    const { result } = renderHook(() => useEnvioDaConversa(conversa({ status: "closed" })));
    expect(result.current.fechada).toBe(true);
  });

  it("sem conversa selecionada, não bloqueia nada", () => {
    const { result } = renderHook(() => useEnvioDaConversa(null));
    expect(result.current).toMatchObject({ motivoDaJanela: null, blockedReason: null, fechada: false });
  });
});
