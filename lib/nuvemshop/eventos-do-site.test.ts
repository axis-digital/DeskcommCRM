import { describe, expect, it } from "vitest";

import { chavesDe } from "./sync/contato-do-pedido";
import { eventoDeCadastro, eventoDeCarrinhoAbandonado, paraCentavos } from "./eventos-do-site";

const cliente = (over: Record<string, unknown> = {}) => ({
  id: 288418604,
  name: "Maria Silva",
  email: "Maria@Exemplo.com",
  phone: "+5511987654321",
  identification: "529.982.247-25",
  created_at: "2026-10-06T14:33:12+0000",
  ...over,
});

const carrinho = (over: Record<string, unknown> = {}) => ({
  id: 411335234,
  token: "d0e589b2ba4fef1a4155dc071c253dfk1j34198b9",
  abandoned_checkout_url: "https://loja.exemplo/checkout/v3/order/proxy/411335234/d0e589b2ba4fef1a4155dc071c253dfk1j34198b9",
  contact_email: "teste@teste.com.br",
  contact_name: "Teste 12",
  contact_phone: "+551335593019",
  contact_identification: "78448385071",
  shipping_address: "Rua Ali",
  total: "291.35",
  currency: "BRL",
  created_at: "2026-10-12T19:08:06+0000",
  updated_at: "2026-10-13T21:04:00+0000",
  completed_at: null,
  products: [
    { id: 1, name: "Varinha", price: "58.07", quantity: 5 },
    { id: 2, name: "Capa", price: "10.00", quantity: 2 },
  ],
  ...over,
});

describe("paraCentavos", () => {
  it.each([
    ["291.35", 29135],
    ["0.00", 0],
    ["1999.99", 199999],
    ["10", 1000],
    [291.35, 29135],
  ])("%s vira %i centavos", (entrada, esperado) => {
    expect(paraCentavos(entrada)).toBe(esperado);
  });

  it.each([[null], [undefined], [""], ["abc"], [Number.NaN]])("%s vira null, não zero", (entrada) => {
    expect(paraCentavos(entrada as never)).toBeNull();
  });
});

describe("chavesDe", () => {
  it("normaliza e-mail, telefone e CPF e descarta o que não é válido", () => {
    expect(chavesDe({ telefone: "+5511987654321", email: " Maria@Exemplo.com ", cpf: "529.982.247-25", nome: " Maria " })).toEqual({
      telefone: "+5511987654321",
      email: "maria@exemplo.com",
      cpf: "52998224725",
      nome: "Maria",
    });
    expect(chavesDe({ telefone: "123", email: "sem-arroba", cpf: "1", nome: "" })).toEqual({
      telefone: null,
      email: null,
      cpf: null,
      nome: null,
    });
  });
});

describe("eventoDeCadastro", () => {
  it("vira um evento 'cadastro' com a data do cadastro na loja e uma chave por cliente", () => {
    const r = eventoDeCadastro(cliente())!;

    expect(r.evento).toMatchObject({
      kind: "cadastro",
      source: "nuvemshop",
      dedupe_key: "cadastro:288418604",
      occurred_at: "2026-10-06T14:33:12.000Z",
    });
    expect(r.chaves.email).toBe("maria@exemplo.com");
  });

  it("o payload guarda só o id do cliente: nada de nome, e-mail, telefone ou CPF", () => {
    const { payload } = eventoDeCadastro(cliente())!.evento;

    expect(payload).toEqual({ customer_id: "288418604" });
  });

  it("sem id, não há fato a registrar", () => {
    expect(eventoDeCadastro(cliente({ id: undefined }))).toBeNull();
    expect(eventoDeCadastro(null)).toBeNull();
    expect(eventoDeCadastro("texto")).toBeNull();
  });

  it("data ilegível cai no instante recebido, em vez de gravar 'Invalid Date'", () => {
    const antes = Date.now();
    const r = eventoDeCadastro(cliente({ created_at: "ontem" }))!;
    expect(new Date(r.evento.occurred_at).getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });
});

describe("eventoDeCarrinhoAbandonado", () => {
  it("vira 'carrinho_abandonado' com a chave do carrinho e a data da última atividade", () => {
    const r = eventoDeCarrinhoAbandonado(carrinho())!;

    expect(r.evento).toMatchObject({
      kind: "carrinho_abandonado",
      source: "nuvemshop",
      dedupe_key: "carrinho_abandonado:411335234",
      occurred_at: "2026-10-13T21:04:00.000Z",
    });
  });

  it("guarda valor, moeda, itens e o id do carrinho", () => {
    expect(eventoDeCarrinhoAbandonado(carrinho())!.evento.payload).toEqual({
      checkout_id: "411335234",
      total_cents: 29135,
      currency: "BRL",
      itens: 7,
    });
  });

  it("NÃO guarda o token nem a URL do checkout (quem tem a URL entra no carrinho), nem endereço, nome ou telefone", () => {
    const json = JSON.stringify(eventoDeCarrinhoAbandonado(carrinho())!.evento);

    expect(json).not.toContain("d0e589b2ba4fef1a4155dc071c253dfk1j34198b9");
    expect(json).not.toContain("proxy");
    expect(json).not.toContain("Rua Ali");
    expect(json).not.toContain("Teste 12");
    expect(json).not.toContain("1335593019");
    expect(json).not.toContain("teste@teste.com.br");
  });

  it("as chaves do contato saem do próprio carrinho (e-mail, telefone, CPF, nome)", () => {
    expect(eventoDeCarrinhoAbandonado(carrinho())!.chaves).toMatchObject({
      email: "teste@teste.com.br",
      telefone: "+551335593019",
      cpf: "78448385071",
      nome: "Teste 12",
    });
  });

  it("carrinho que virou pedido não é abandono", () => {
    expect(eventoDeCarrinhoAbandonado(carrinho({ completed_at: "2026-10-13T22:00:00+0000" }))).toBeNull();
  });

  it("sem a data de atualização usa a de criação", () => {
    const r = eventoDeCarrinhoAbandonado(carrinho({ updated_at: undefined }))!;
    expect(r.evento.occurred_at).toBe("2026-10-12T19:08:06.000Z");
  });

  it("valor ausente fica fora do payload em vez de virar zero", () => {
    const { payload } = eventoDeCarrinhoAbandonado(carrinho({ total: null }))!.evento;
    expect(payload).not.toHaveProperty("total_cents");
  });

  it("sem id não há fato a registrar", () => {
    expect(eventoDeCarrinhoAbandonado(carrinho({ id: null }))).toBeNull();
    expect(eventoDeCarrinhoAbandonado(undefined)).toBeNull();
  });
});
