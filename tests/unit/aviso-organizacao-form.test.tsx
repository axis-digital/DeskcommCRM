import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AvisoOrganizacaoForm } from "@/app/app/settings/atendimento/_aviso-organizacao-form";

const h = vi.hoisted(() => ({ patch: vi.fn(), erro: vi.fn(), ok: vi.fn() }));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/lib/api/client", () => ({ apiClient: { patch: h.patch } }));
vi.mock("sonner", () => ({ toast: { error: h.erro, success: h.ok } }));

const config = {
  enabled: true,
  timezone: "America/Sao_Paulo",
  windows: [
    { dow: 1, start: "09:00", end: "18:00" },
    { dow: 6, start: "09:00", end: "12:00" },
  ],
  notice: "Voltamos amanhã às 9h.",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.patch.mockResolvedValue({});
});

describe("formulário do aviso de fora do horário da organização", () => {
  it("abre com a configuração gravada: ligado, fuso, janelas e texto", () => {
    render(<AvisoOrganizacaoForm inicial={config} podeMudar />);
    expect(screen.getByTestId("aviso-organizacao-enabled")).toBeChecked();
    expect(screen.getByLabelText("Fuso horário")).toHaveValue("America/Sao_Paulo");
    const janelas = screen.getAllByTestId("aviso-organizacao-janela");
    expect(janelas).toHaveLength(2);
    expect(within(janelas[1]!).getByLabelText("Dia da semana")).toHaveValue("6");
    expect(within(janelas[1]!).getByLabelText("Fim")).toHaveValue("12:00");
    expect(screen.getByLabelText("Texto do aviso")).toHaveValue("Voltamos amanhã às 9h.");
  });

  it("sem configuração abre desligado, sem mostrar campos", () => {
    render(<AvisoOrganizacaoForm inicial={null} podeMudar />);
    expect(screen.getByTestId("aviso-organizacao-enabled")).not.toBeChecked();
    expect(screen.queryByLabelText("Texto do aviso")).not.toBeInTheDocument();
  });

  it("ligar com dados válidos envia o corpo completo", async () => {
    render(<AvisoOrganizacaoForm inicial={null} podeMudar />);
    fireEvent.click(screen.getByTestId("aviso-organizacao-enabled"));
    fireEvent.change(screen.getByLabelText("Texto do aviso"), { target: { value: "Fora do horário." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledTimes(1));
    expect(h.patch).toHaveBeenCalledWith("/api/v1/aviso-organizacao", {
      enabled: true,
      timezone: "America/Sao_Paulo",
      windows: [{ dow: 1, start: "09:00", end: "18:00" }],
      notice: "Fora do horário.",
    });
  });

  it("ligar sem texto mostra o erro e NÃO chama a API", () => {
    render(<AvisoOrganizacaoForm inicial={null} podeMudar />);
    fireEvent.click(screen.getByTestId("aviso-organizacao-enabled"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Escreva o texto do aviso.")).toBeVisible();
    expect(h.patch).not.toHaveBeenCalled();
  });

  it("ligar sem nenhuma janela mostra o erro e NÃO chama a API", () => {
    render(<AvisoOrganizacaoForm inicial={{ ...config, windows: [{ dow: 1, start: "09:00", end: "18:00" }] }} podeMudar />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Informe ao menos uma janela, com o fim depois do início.")).toBeVisible();
    expect(h.patch).not.toHaveBeenCalled();
  });

  it("janela com fim antes do início é recusada no formulário", () => {
    render(<AvisoOrganizacaoForm inicial={config} podeMudar />);
    const primeira = screen.getAllByTestId("aviso-organizacao-janela")[0]!;
    fireEvent.change(within(primeira).getByLabelText("Fim"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Informe ao menos uma janela, com o fim depois do início.")).toBeVisible();
    expect(h.patch).not.toHaveBeenCalled();
  });

  it("desligar envia só {enabled:false}, mesmo sem janelas nem texto", async () => {
    render(<AvisoOrganizacaoForm inicial={{ ...config, notice: "" }} podeMudar />);
    fireEvent.click(screen.getByTestId("aviso-organizacao-enabled"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledTimes(1));
    expect(h.patch).toHaveBeenCalledWith("/api/v1/aviso-organizacao", { enabled: false });
  });

  it("adicionar janela acrescenta uma linha", () => {
    render(<AvisoOrganizacaoForm inicial={config} podeMudar />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar janela" }));
    expect(screen.getAllByTestId("aviso-organizacao-janela")).toHaveLength(3);
  });

  it("sem permissão, campos e botão ficam desabilitados e a causa é dita", () => {
    render(<AvisoOrganizacaoForm inicial={config} podeMudar={false} />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(screen.getByTestId("aviso-organizacao-enabled")).toBeDisabled();
    expect(screen.getByText("Só quem administra a empresa pode alterar.")).toBeVisible();
  });

  it("falha da API não anuncia salvo", async () => {
    h.patch.mockRejectedValue(new Error("Falhou."));
    render(<AvisoOrganizacaoForm inicial={config} podeMudar />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(h.erro).toHaveBeenCalledWith("Falhou."));
    expect(h.ok).not.toHaveBeenCalled();
  });
});
