/**
 * O PEDIDO DA LOJA APARECE NA LINHA DO TEMPO DO CONTATO, COM O QUE A PESSOA PROCURA.
 *
 * Quem abre a ficha de um cliente quer saber "o que ele comprou": o número do
 * pedido, a situação e o valor. A rota entrega o pedido como item de timeline
 * (`type = order_placed`, sem `lead_id`); a tela tem de escrever isso como gente
 * fala. Sem o tratamento, o item cairia no fallback do vocabulário e a linha
 * diria "Atividade registrada" — a pior resposta possível para quem procura uma
 * compra.
 *
 * Mede, pela tela montada (sem `curl`), as duas pontas: o pedido ganha rótulo,
 * quem agiu e corpo próprios, e a atividade comum continua exatamente como era.
 */
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineView } from "@/components/contacts/TimelineView";

const pedido = {
  id: "o-1",
  organization_id: "org-1",
  lead_id: null,
  contact_id: "c-1",
  source_module: "nuvemshop",
  source_id: "o-1",
  type: "order_placed",
  payload: {
    numero: "380",
    external_id: "2087970484",
    status: "shipped",
    total_cents: 37990,
    currency: "BRL",
  },
  metadata: {},
  performed_at: "2026-10-06T17:33:12.000Z",
  performed_by_user_id: null,
  actor_kind: "contact",
  actor_agent_id: null,
  reason: null,
  evidence: null,
};

const abandono = {
  id: "s-2",
  organization_id: "org-1",
  lead_id: null,
  contact_id: "c-1",
  source_module: "nuvemshop",
  source_id: "s-2",
  type: "carrinho_abandonado",
  payload: { checkout_id: "411335234", total_cents: 29135, currency: "BRL", itens: 7 },
  metadata: {},
  performed_at: "2026-10-06T18:00:00.000Z",
  performed_by_user_id: null,
  actor_kind: "contact",
  actor_agent_id: null,
  reason: null,
  evidence: null,
};

const cadastro = {
  ...abandono,
  id: "s-1",
  source_id: "s-1",
  type: "cadastro",
  payload: { customer_id: "288418604" },
  performed_at: "2026-10-05T12:00:00.000Z",
};

const nota = {
  id: "a-1",
  organization_id: "org-1",
  lead_id: "l-1",
  contact_id: "c-1",
  source_module: "crm",
  source_id: null,
  type: "lead_created",
  payload: {},
  metadata: {},
  performed_at: "2026-10-05T17:00:00.000Z",
  performed_by_user_id: null,
  actor_kind: "system",
  reason: "Primeira mensagem recebida",
};

vi.mock("@/hooks/contacts/useTimeline", () => ({
  useTimeline: () => ({
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => undefined,
    refetch: () => undefined,
    data: { pages: [{ data: [pedido, abandono, cadastro, nota] }] },
  }),
}));

afterEach(cleanup);

/** O `Intl` separa "R$" do valor com NBSP; a asserção não deve depender dele. */
const semNbsp = (s: string | null) => (s ?? "").replace(/ /g, " ");

describe("TimelineView — pedido da loja", () => {
  it("escreve o pedido como 'Pedido realizado', não como atividade genérica", () => {
    render(<TimelineView contactId="c-1" />);

    expect(screen.getByText("Pedido realizado")).toBeTruthy();
    expect(screen.queryByText("Atividade registrada")).toBeNull();
  });

  it("mostra número, situação e valor do pedido", () => {
    render(<TimelineView contactId="c-1" />);

    const corpo = screen.getByText(
      (_, el) => el?.tagName === "P" && semNbsp(el.textContent).includes("#380"),
    );
    expect(semNbsp(corpo.textContent)).toBe("#380 · Despachado · R$ 379,90");
  });

  it("diz que o ator foi o cliente", () => {
    render(<TimelineView contactId="c-1" />);

    expect(screen.getAllByText(/·\s*Cliente/).length).toBeGreaterThanOrEqual(1);
  });

  it("a atividade comum segue com o rótulo e o motivo de sempre", () => {
    render(<TimelineView contactId="c-1" />);

    expect(screen.getByText("Primeira mensagem recebida")).toBeTruthy();
  });
});

describe("TimelineView — eventos do site", () => {
  it("escreve o cadastro como 'Cadastro na loja'", () => {
    render(<TimelineView contactId="c-1" />);

    expect(screen.getByText("Cadastro na loja")).toBeTruthy();
  });

  it("escreve o carrinho abandonado com o valor e a quantidade de itens", () => {
    render(<TimelineView contactId="c-1" />);

    expect(screen.getByText("Carrinho abandonado")).toBeTruthy();
    const corpo = screen.getByText((_, el) => el?.tagName === "P" && semNbsp(el.textContent).includes("7 itens"));
    expect(semNbsp(corpo.textContent)).toBe("R$ 291,35 · 7 itens");
  });

  it("nada que veio da loja cai no fallback 'Atividade registrada'", () => {
    render(<TimelineView contactId="c-1" />);

    expect(screen.queryByText("Atividade registrada")).toBeNull();
  });
});
