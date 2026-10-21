/**
 * A Inbox convida a ligar as notificações da área de trabalho.
 *
 * Antes a permissão do navegador só era pedida em Configurações ›
 * Notificações, e quem não abria aquela tela nunca recebia aviso de mensagem
 * nova. Os casos prendem: a faixa só aparece quando um clique resolve
 * (`default`), o botão pede a permissão, e "Agora não" a tira de vez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { gravarCanal } from "@/lib/notifications/prefs";

const estado: { permission: NotificationPermission | "unsupported" } = { permission: "default" };
const request = vi.fn();

vi.mock("@/hooks/notifications/useNotificationPermission", () => ({
  useNotificationPermission: () => ({
    permission: estado.permission,
    enabled: false,
    request,
    setEnabled: vi.fn(),
  }),
}));

import { ConviteNotificacoes } from "./ConviteNotificacoes";

describe("ConviteNotificacoes", () => {
  beforeEach(() => {
    estado.permission = "default";
    request.mockReset();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("aparece quando o navegador ainda não perguntou, e o botão pede a permissão", async () => {
    render(<ConviteNotificacoes />);

    await userEvent.click(screen.getByRole("button", { name: "Ativar notificações" }));

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("não aparece para quem já concedeu", () => {
    estado.permission = "granted";
    render(<ConviteNotificacoes />);
    expect(screen.queryByTestId("convite-notificacoes")).toBeNull();
  });

  it("não aparece para quem desligou o push de mensagem em Configurações", () => {
    gravarCanal("message", "push", false);
    render(<ConviteNotificacoes />);
    expect(screen.queryByTestId("convite-notificacoes")).toBeNull();
    gravarCanal("message", "push", true);
  });

  it("'Agora não' tira a faixa e ela não volta na próxima montagem", async () => {
    const { unmount } = render(<ConviteNotificacoes />);

    await userEvent.click(screen.getByRole("button", { name: "Agora não" }));

    expect(screen.queryByTestId("convite-notificacoes")).toBeNull();
    unmount();
    render(<ConviteNotificacoes />);
    expect(screen.queryByTestId("convite-notificacoes")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
