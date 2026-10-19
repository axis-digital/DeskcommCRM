import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useContact = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/contacts/useContact", () => ({ useContact }));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/hooks/kanban/useBoard", () => ({
  chaveDoQuadro: (pipelineId: string | null) => ["kanban-board", pipelineId],
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { ContatoDoNegocio } from "./ContatoDoNegocio";

const CONTATO = {
  id: "c-1",
  name: "Ana Souza",
  display_name: null,
  phone_number: "+5585999990000",
  email: "ana@exemplo.com",
  custom_fields: {},
  updated_at: "2026-10-19T10:00:00Z",
};

function montar(podeEditar: boolean) {
  const cliente = new QueryClient();
  const invalidar = vi.spyOn(cliente, "invalidateQueries");
  render(
    <QueryClientProvider client={cliente}>
      <ContatoDoNegocio contactId="c-1" pipelineId="p-1" podeEditar={podeEditar} />
    </QueryClientProvider>,
  );
  return { invalidar };
}

const abrirEdicao = () => fireEvent.click(screen.getByRole("button", { name: "Editar contato" }));

describe("editar nome e e-mail do contato pelo dossiê", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ data: CONTATO });
    toast.error.mockClear();
    toast.success.mockClear();
    useContact.mockReturnValue({ data: { data: CONTATO }, isLoading: false, isError: false });
  });

  it("quem não pode editar não vê o botão (a rota daria 403)", () => {
    montar(false);
    expect(screen.queryByRole("button", { name: "Editar contato" })).toBeNull();
  });

  it("Editar abre nome e e-mail já preenchidos; o telefone segue só leitura", () => {
    montar(true);
    abrirEdicao();
    expect(screen.getByLabelText("Nome")).toHaveValue("Ana Souza");
    expect(screen.getByLabelText("E-mail")).toHaveValue("ana@exemplo.com");
    expect(screen.queryByLabelText("Telefone")).toBeNull();
    expect(screen.getByText("+5585999990000")).toBeInTheDocument();
  });

  it("salvar manda só o que mudou e relê o quadro (o card mostra o nome do contato)", async () => {
    const { invalidar } = montar(true);
    abrirEdicao();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Souza Lima" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ name: "Ana Souza Lima" }));
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["kanban-board", "p-1"] });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Contato atualizado."));
    expect(screen.queryByLabelText("Nome")).toBeNull();
  });

  it("trocar o e-mail manda só o e-mail", async () => {
    montar(true);
    abrirEdicao();
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "nova@exemplo.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ email: "nova@exemplo.com" }));
  });

  it("e-mail inválido é recusado na tela, sem ir ao servidor", () => {
    montar(true);
    abrirEdicao();
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "isto-nao-e-email" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByText("E-mail inválido.")).toBeVisible();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("nome em branco é recusado; e o e-mail já cadastrado não pode ser apagado por aqui (a rota não limpa)", () => {
    montar(true);
    abrirEdicao();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByText("Informe o nome.")).toBeVisible();
    expect(screen.getByText("O e-mail não pode ficar em branco aqui.")).toBeVisible();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("sem alteração, Salvar só fecha a edição — nenhuma chamada", () => {
    montar(true);
    abrirEdicao();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nome")).toBeNull();
  });

  it("Cancelar descarta o que foi digitado", () => {
    montar(true);
    abrirEdicao();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Outro nome" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Nome")).toBeNull();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("contato sem e-mail: o campo nasce vazio e continuar vazio não é erro", async () => {
    useContact.mockReturnValue({ data: { data: { ...CONTATO, email: null } }, isLoading: false, isError: false });
    montar(true);
    abrirEdicao();
    expect(screen.getByLabelText("E-mail")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana S." } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ name: "Ana S." }));
  });
});
