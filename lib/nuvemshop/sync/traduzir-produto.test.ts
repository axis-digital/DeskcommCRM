import { describe, expect, it } from "vitest";
import { ErroDeTraducao } from "./traduzir-pedido";
import { traduzirProduto } from "./traduzir-produto";

const base = {
  id: 501,
  name: { pt: "Vela de Lavanda", es: "Vela de Lavanda ES" },
  description: { pt: "<p>Aroma <b>suave</b></p>" },
  canonical_url: "https://loja.exemplo/produtos/vela-de-lavanda/",
  images: [{ id: 1, src: "https://cdn.exemplo/vela.jpg" }],
  variants: [
    { id: 1, price: "89.90", stock: 4 },
    { id: 2, price: "79.90", stock: 6 },
  ],
  created_at: "2026-09-01T10:00:00+0000",
  updated_at: "2026-10-20T12:30:00+0000",
};

describe("traduzirProduto", () => {
  it("traduz o produto da API para a linha de nuvemshop_products", () => {
    const l = traduzirProduto(base);
    expect(l).toMatchObject({
      external_id: "501",
      title: "Vela de Lavanda",
      description: "Aroma suave",
      price_cents: 7990,
      available_qty: 10,
      url: "https://loja.exemplo/produtos/vela-de-lavanda/",
      image_url: "https://cdn.exemplo/vela.jpg",
      last_updated_at: "2026-10-20T12:30:00.000Z",
    });
    expect(l.payload).toMatchObject({ id: 501 });
  });

  it("o preço é o da variante mais barata, por string (sem erro de ponto flutuante)", () => {
    const l = traduzirProduto({ ...base, variants: [{ price: "0.10" }, { price: "0.20" }, { price: "19.99" }] });
    expect(l.price_cents).toBe(10);
  });

  it("estoque nulo (sem controle) não soma, e variante sem estoque conta zero", () => {
    const l = traduzirProduto({ ...base, variants: [{ price: "10.00", stock: null }, { price: "10.00", stock: 3 }] });
    expect(l.available_qty).toBe(3);
  });

  it("título cai para outro idioma quando falta o pt, e aceita nome como texto", () => {
    expect(traduzirProduto({ ...base, name: { es: "Vela" } }).title).toBe("Vela");
    expect(traduzirProduto({ ...base, name: "Vela simples" }).title).toBe("Vela simples");
  });

  it("sem variante com preço o preço é zero; a loja pode ter produto ainda sem preço", () => {
    expect(traduzirProduto({ ...base, variants: [] }).price_cents).toBe(0);
    expect(traduzirProduto({ ...base, variants: undefined }).price_cents).toBe(0);
  });

  it("sem imagem, sem descrição e sem url ficam nulos", () => {
    const l = traduzirProduto({ ...base, images: [], description: null, canonical_url: null });
    expect(l).toMatchObject({ image_url: null, description: null, url: null });
  });

  it("recusa produto sem nome, para a página seguir sem ele", () => {
    expect(() => traduzirProduto({ ...base, name: {} })).toThrow(ErroDeTraducao);
    expect(() => traduzirProduto({ ...base, name: { pt: "   " } })).toThrow(ErroDeTraducao);
  });

  it("recusa data de atualização que não é data", () => {
    expect(() => traduzirProduto({ ...base, updated_at: "ontem" })).toThrow(ErroDeTraducao);
  });

  it("campo desconhecido da Nuvemshop não derruba a tradução", () => {
    expect(() => traduzirProduto({ ...base, campo_novo: { qualquer: 1 } })).not.toThrow();
  });
});
