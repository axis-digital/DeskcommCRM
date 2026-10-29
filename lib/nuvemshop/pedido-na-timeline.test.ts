import { describe, expect, it } from "vitest";

import {
  PEDIDO_COLS,
  ROTULO_DO_PEDIDO,
  TIPO_PEDIDO_NA_TIMELINE,
  corpoDoPedido,
  ehPedidoDaTimeline,
  pedidoParaItemDaTimeline,
  type PedidoParaTimeline,
} from "./pedido-na-timeline";

/** O espaço que o `Intl` põe entre "R$" e o valor é NBSP; a asserção não deve depender dele. */
const semNbsp = (s: string) => s.replace(/ /g, " ");

const pedido = (over: Partial<PedidoParaTimeline> = {}): PedidoParaTimeline => ({
  id: "0a1b2c3d-0000-4000-8000-000000000001",
  organization_id: "bc1e396c-9917-4381-8f43-ad99fba137c2",
  contact_id: "6fcae1d2-5be4-4ad8-900a-3c9f1fd9b1fd",
  external_provider: "nuvemshop",
  external_id: "2087970484",
  status: "shipped",
  total_cents: 37990,
  currency: "BRL",
  ordered_at: "2026-10-06T14:33:12.123+00:00",
  numero: "380",
  ...over,
});

describe("pedidoParaItemDaTimeline", () => {
  it("vira um item de timeline com a data do PEDIDO, não a da sincronização", () => {
    const item = pedidoParaItemDaTimeline(pedido());

    expect(item).toMatchObject({
      id: "0a1b2c3d-0000-4000-8000-000000000001",
      organization_id: "bc1e396c-9917-4381-8f43-ad99fba137c2",
      contact_id: "6fcae1d2-5be4-4ad8-900a-3c9f1fd9b1fd",
      source_module: "nuvemshop",
      source_id: "0a1b2c3d-0000-4000-8000-000000000001",
      type: TIPO_PEDIDO_NA_TIMELINE,
      performed_at: "2026-10-06T14:33:12.123+00:00",
    });
  });

  it("não tem negócio: contato que só comprou não tem lead, e a timeline não inventa um", () => {
    expect(pedidoParaItemDaTimeline(pedido()).lead_id).toBeNull();
  });

  it("quem agiu foi o cliente, e ninguém é nomeado (o pedido não carrega o nome da pessoa)", () => {
    const item = pedidoParaItemDaTimeline(pedido());

    expect(item.actor_kind).toBe("contact");
    expect(item.performed_by_user_id).toBeNull();
    expect(item.actor_agent_id).toBeNull();
  });

  it("o payload leva só o que a linha mostra — nada de e-mail, telefone ou endereço", () => {
    const { payload } = pedidoParaItemDaTimeline(pedido());

    expect(payload).toEqual({
      numero: "380",
      external_id: "2087970484",
      status: "shipped",
      total_cents: 37990,
      currency: "BRL",
    });
  });

  it("a fonte é o provedor do pedido, sem nomear nenhum no código", () => {
    expect(
      pedidoParaItemDaTimeline(pedido({ external_provider: "outra_loja" })).source_module,
    ).toBe("outra_loja");
  });

  it("pedido sem provedor cai num nome neutro, nunca em string vazia", () => {
    expect(pedidoParaItemDaTimeline(pedido({ external_provider: null })).source_module).toBe(
      "loja",
    );
  });
});

describe("ehPedidoDaTimeline", () => {
  it("reconhece o item de pedido e só ele", () => {
    expect(ehPedidoDaTimeline({ type: TIPO_PEDIDO_NA_TIMELINE })).toBe(true);
    expect(ehPedidoDaTimeline({ type: "lead_created" })).toBe(false);
  });
});

describe("corpoDoPedido", () => {
  it("monta '#número · situação · valor'", () => {
    const corpo = corpoDoPedido(pedidoParaItemDaTimeline(pedido()).payload);

    expect(semNbsp(corpo)).toBe("#380 · Despachado · R$ 379,90");
  });

  it("sem número da loja usa o código externo do pedido", () => {
    const corpo = corpoDoPedido(pedidoParaItemDaTimeline(pedido({ numero: null })).payload);

    expect(corpo.startsWith("#2087970484")).toBe(true);
  });

  it("traduz a situação pelo `t` recebido", () => {
    const corpo = corpoDoPedido(
      pedidoParaItemDaTimeline(pedido({ status: "delivered" })).payload,
      (texto) => (texto === "Entregue" ? "Delivered" : texto),
    );

    expect(corpo).toContain("Delivered");
  });

  it.each([
    ["pending", "Aguardando pagamento"],
    ["paid", "Pago"],
    ["packed", "Embalado"],
    ["shipped", "Despachado"],
    ["delivered", "Entregue"],
    ["cancelled", "Cancelado"],
  ])("situação %s aparece como %s", (status, esperado) => {
    expect(corpoDoPedido(pedidoParaItemDaTimeline(pedido({ status })).payload)).toContain(esperado);
  });

  it("situação desconhecida aparece como veio, em vez de sumir", () => {
    expect(
      corpoDoPedido(pedidoParaItemDaTimeline(pedido({ status: "em_analise" })).payload),
    ).toContain("em_analise");
  });

  it("sem valor, omite o valor em vez de mostrar R$ 0,00", () => {
    const corpo = corpoDoPedido(pedidoParaItemDaTimeline(pedido({ total_cents: null })).payload);

    expect(semNbsp(corpo)).toBe("#380 · Despachado");
  });

  it("moeda ausente assume a padrão do produto", () => {
    const corpo = corpoDoPedido(pedidoParaItemDaTimeline(pedido({ currency: null })).payload);

    expect(semNbsp(corpo)).toContain("R$ 379,90");
  });

  it("payload vazio não quebra a tela", () => {
    expect(corpoDoPedido({})).toBe("");
  });
});

describe("contrato com o banco", () => {
  it("o SELECT pede o número da loja pelo mesmo atalho do painel da Inbox", () => {
    expect(PEDIDO_COLS).toContain("numero:payload->>number");
  });

  it("o SELECT não pede o payload inteiro: a timeline só precisa do número", () => {
    expect(PEDIDO_COLS).not.toMatch(/(^|, )payload(,|$)/);
  });

  it("o rótulo da linha é estável, porque ele é a chave de tradução", () => {
    expect(ROTULO_DO_PEDIDO).toBe("Pedido realizado");
  });
});
