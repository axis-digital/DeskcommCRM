import { describe, expect, it } from "vitest";

import { descreverItemDaLoja } from "./item-da-loja";
import { pedidoParaItemDaTimeline } from "./pedido-na-timeline";
import { eventoDoSiteParaItemDaTimeline } from "./evento-do-site-na-timeline";

const semNbsp = (s: string) => s.replace(/ /g, " ");

describe("descreverItemDaLoja", () => {
  it("pedido: rótulo e corpo do pedido", () => {
    const item = pedidoParaItemDaTimeline({
      id: "o1", organization_id: "org", contact_id: "c", external_provider: "nuvemshop", external_id: "9",
      status: "shipped", total_cents: 37990, currency: "BRL", ordered_at: "2026-10-06T14:33:12+00:00", numero: "380",
    });
    const d = descreverItemDaLoja(item)!;
    expect(d.rotulo).toBe("Pedido realizado");
    expect(semNbsp(d.corpo)).toBe("#380 · Despachado · R$ 379,90");
  });

  it("evento do site: rótulo e corpo do evento", () => {
    const item = eventoDoSiteParaItemDaTimeline({
      id: "e1", organization_id: "org", contact_id: "c", kind: "carrinho_abandonado", source: "nuvemshop",
      occurred_at: "2026-10-13T21:04:00+00:00", ga_client_id: null, ga_session_id: null,
      payload: { total_cents: 29135, currency: "BRL", itens: 7 },
    });
    const d = descreverItemDaLoja(item)!;
    expect(d.rotulo).toBe("Carrinho abandonado");
    expect(semNbsp(d.corpo)).toBe("R$ 291,35 · 7 itens");
  });

  it("atividade comum: devolve null, para a tela seguir o caminho de sempre", () => {
    expect(descreverItemDaLoja({ type: "lead_created", payload: {} })).toBeNull();
  });

  it("traduz rótulo e corpo pelo `t`", () => {
    const t = (s: string) => ({ "Carrinho abandonado": "Abandoned cart", itens: "items" })[s] ?? s;
    const item = eventoDoSiteParaItemDaTimeline({
      id: "e1", organization_id: "org", contact_id: "c", kind: "carrinho_abandonado", source: "nuvemshop",
      occurred_at: "2026-10-13T21:04:00+00:00", ga_client_id: null, ga_session_id: null, payload: { itens: 2 },
    });
    expect(descreverItemDaLoja(item, t)).toEqual({ rotulo: "Abandoned cart", corpo: "2 items" });
  });
});
