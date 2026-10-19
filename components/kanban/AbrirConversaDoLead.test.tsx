import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { AbrirConversaDoLead } from "./AbrirConversaDoLead";

const resposta = () =>
  new Response(JSON.stringify({ data: { conversation_id: "conv-9" } }), { status: 200 });

function montar(onAberta?: (id: string) => void) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AbrirConversaDoLead contactId="k1" phone="5585999999999" variante="dossie" onAberta={onAberta} />
    </QueryClientProvider>,
  );
}

describe("AbrirConversaDoLead", () => {
  beforeEach(() => {
    push.mockClear();
    vi.spyOn(global, "fetch").mockImplementation(async () => resposta());
  });
  afterEach(() => vi.restoreAllMocks());

  it("com onAberta, entrega o id da conversa e não navega para a Inbox", async () => {
    const onAberta = vi.fn();
    montar(onAberta);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onAberta).toHaveBeenCalledWith("conv-9"));
    expect(push).not.toHaveBeenCalled();
  });

  it("com onAberta, o botão volta a ficar utilizável depois de abrir", async () => {
    montar(vi.fn());
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("com onAberta o rótulo não promete a Inbox (o clique fica no dossiê); sem ele, promete", () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AbrirConversaDoLead contactId="k1" phone="5585999999999" variante="dossie" onAberta={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent(/^Abrir conversa$/);
    expect(screen.getByRole("button")).toHaveAttribute("title", "Abrir conversa");
    unmount();
    montar();
    expect(screen.getByRole("button")).toHaveTextContent("Abrir conversa no Inbox");
  });

  it("sem onAberta, mantém o comportamento de sempre: vai para a Inbox", async () => {
    montar();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/inbox?id=conv-9"));
  });
});
