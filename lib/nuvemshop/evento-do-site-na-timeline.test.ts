import { describe, expect, it } from "vitest";

import {
  EVENTO_COLS,
  corpoDoEventoDoSite,
  ehEventoDoSite,
  eventoDoSiteParaItemDaTimeline,
  rotuloDoEventoDoSite,
  type EventoDoSiteLido,
} from "./evento-do-site-na-timeline";

const semNbsp = (s: string) => s.replace(/ /g, " ");

const evento = (over: Partial<EventoDoSiteLido> = {}): EventoDoSiteLido => ({
  id: "e1",
  organization_id: "org-1",
  contact_id: "c1",
  kind: "carrinho_abandonado",
  source: "nuvemshop",
  occurred_at: "2026-10-13T21:04:00+00:00",
  ga_client_id: null,
  ga_session_id: null,
  payload: { checkout_id: "411335234", total_cents: 29135, currency: "BRL", itens: 7 },
  ...over,
});

describe("eventoDoSiteParaItemDaTimeline", () => {
  it("vira item da timeline do contato, sem negócio, com o cliente como ator", () => {
    const item = eventoDoSiteParaItemDaTimeline(evento());

    expect(item).toMatchObject({
      id: "e1",
      organization_id: "org-1",
      contact_id: "c1",
      lead_id: null,
      type: "carrinho_abandonado",
      source_module: "nuvemshop",
      performed_at: "2026-10-13T21:04:00+00:00",
      actor_kind: "contact",
      performed_by_user_id: null,
    });
  });

  it("leva o payload como está (já nasce mínimo) e o GA4 quando houver", () => {
    const item = eventoDoSiteParaItemDaTimeline(evento({ ga_client_id: "1.2", ga_session_id: "3" }));
    expect(item.payload).toEqual({ checkout_id: "411335234", total_cents: 29135, currency: "BRL", itens: 7 });
    expect(item.metadata).toEqual({ ga_client_id: "1.2", ga_session_id: "3" });
  });
});

describe("ehEventoDoSite", () => {
  it.each(["cadastro", "carrinho_adicionado", "checkout_iniciado", "carrinho_abandonado"])("%s é evento do site", (k) => {
    expect(ehEventoDoSite({ type: k })).toBe(true);
  });
  it("atividade comum e pedido não são", () => {
    expect(ehEventoDoSite({ type: "lead_created" })).toBe(false);
    expect(ehEventoDoSite({ type: "order_placed" })).toBe(false);
  });
});

describe("rotuloDoEventoDoSite", () => {
  it.each([
    ["cadastro", "Cadastro na loja"],
    ["carrinho_adicionado", "Adicionou ao carrinho"],
    ["checkout_iniciado", "Iniciou o checkout"],
    ["carrinho_abandonado", "Carrinho abandonado"],
  ])("%s → %s", (kind, esperado) => {
    expect(rotuloDoEventoDoSite(kind)).toBe(esperado);
  });
});

describe("corpoDoEventoDoSite", () => {
  it("carrinho abandonado: valor e quantidade de itens", () => {
    expect(semNbsp(corpoDoEventoDoSite("carrinho_abandonado", { total_cents: 29135, currency: "BRL", itens: 7 }))).toBe(
      "R$ 291,35 · 7 itens",
    );
  });

  it("um item só fica no singular", () => {
    expect(semNbsp(corpoDoEventoDoSite("carrinho_abandonado", { total_cents: 5000, currency: "BRL", itens: 1 }))).toBe(
      "R$ 50,00 · 1 item",
    );
  });

  it("parte ausente é omitida, nunca inventada", () => {
    expect(corpoDoEventoDoSite("carrinho_abandonado", { itens: 2 })).toBe("2 itens");
    expect(corpoDoEventoDoSite("carrinho_abandonado", {})).toBe("");
  });

  it("cadastro não tem corpo: o rótulo já diz tudo", () => {
    expect(corpoDoEventoDoSite("cadastro", { customer_id: "1" })).toBe("");
  });

  it("traduz o texto pelo `t` recebido", () => {
    const t = (s: string) => (s === "itens" ? "items" : s);
    expect(semNbsp(corpoDoEventoDoSite("carrinho_abandonado", { total_cents: 100, currency: "BRL", itens: 3 }, t))).toContain("3 items");
  });
});

describe("contrato com o banco", () => {
  it("o SELECT pede só colunas da tabela, sem o payload de terceiros", () => {
    expect(EVENTO_COLS.split(",").map((c) => c.trim())).toEqual([
      "id",
      "organization_id",
      "contact_id",
      "kind",
      "source",
      "occurred_at",
      "ga_client_id",
      "ga_session_id",
      "payload",
    ]);
  });
});
