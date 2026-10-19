import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Polyfills que o Radix exige e o jsdom não tem (mesmo padrão de trocar-funil.test.tsx).
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

const mutate = vi.fn();
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/kanban/useBulkAction", () => ({ useBulkAction: () => ({ mutate, isPending: false }) }));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({
    data: [
      { user_id: "u-ana", role: "agent", full_name: "Ana Souza" },
      { user_id: "u-bia", role: "manager", full_name: "Bia Lima" },
    ],
  }),
}));

import { ResponsavelDoNegocio } from "./ResponsavelDoNegocio";

const props = {
  leadId: "lead-1",
  pipelineId: "p-1",
  donoUserId: null as string | null,
  owner: { kind: null, name: null, agentVersion: null } as {
    kind: "user" | "ai" | null;
    name: string | null;
    agentVersion: number | null;
  },
};

describe("ResponsavelDoNegocio", () => {
  beforeEach(() => {
    mutate.mockClear();
    toast.success.mockClear();
  });

  it("sem permissão para atribuir, o selo é só leitura: nada de botão que daria 403", () => {
    render(<ResponsavelDoNegocio {...props} podeAtribuir={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByLabelText("Sem responsável")).toBeInTheDocument();
  });

  it("com permissão, o círculo pontilhado vira o botão que abre a lista de responsáveis", async () => {
    render(<ResponsavelDoNegocio {...props} podeAtribuir />);
    await userEvent.click(screen.getByRole("button", { name: /Alterar responsável/ }));

    expect(await screen.findByRole("menuitemradio", { name: "Sem responsável" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Ana Souza" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Bia Lima" })).toBeInTheDocument();
  });

  it("escolher uma pessoa atribui o negócio pelo mesmo caminho do lote (action assign, um id)", async () => {
    render(<ResponsavelDoNegocio {...props} podeAtribuir />);
    await userEvent.click(screen.getByRole("button", { name: /Alterar responsável/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Ana Souza" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      action: "assign",
      lead_ids: ["lead-1"],
      params: { owner_user_id: "u-ana" },
    });
  });

  it("escolher 'Sem responsável' desatribui (owner_user_id null)", async () => {
    render(
      <ResponsavelDoNegocio
        {...props}
        donoUserId="u-ana"
        owner={{ kind: "user", name: "Ana Souza", agentVersion: null }}
        podeAtribuir
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Alterar responsável: Ana Souza/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Sem responsável" }));

    expect(mutate.mock.calls[0]![0].params).toEqual({ owner_user_id: null });
  });

  it("o responsável atual aparece marcado e escolhê-lo de novo não manda nada ao servidor", async () => {
    render(
      <ResponsavelDoNegocio
        {...props}
        donoUserId="u-bia"
        owner={{ kind: "user", name: "Bia Lima", agentVersion: null }}
        podeAtribuir
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Alterar responsável/ }));
    const atual = await screen.findByRole("menuitemradio", { name: "Bia Lima" });
    expect(atual).toHaveAttribute("aria-checked", "true");

    await userEvent.click(atual);

    expect(mutate).not.toHaveBeenCalled();
  });

  it("negócio de um agente de IA: ninguém aparece marcado, e dá para passar a uma pessoa", async () => {
    render(
      <ResponsavelDoNegocio
        {...props}
        owner={{ kind: "ai", name: "Assistente", agentVersion: 3 }}
        podeAtribuir
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Alterar responsável: Assistente/ }));
    for (const item of await screen.findAllByRole("menuitemradio")) {
      expect(item).toHaveAttribute("aria-checked", "false");
    }
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Bia Lima" }));
    expect(mutate.mock.calls[0]![0].params).toEqual({ owner_user_id: "u-bia" });
  });
});
