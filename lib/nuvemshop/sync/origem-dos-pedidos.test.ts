/**
 * A origem do contato a partir da `landing_url` dos pedidos da loja.
 *
 * O que estes casos guardam:
 *   - a `landing_url` é URL de visitante (NÃO CONFIÁVEL): só UTM e click ids passam,
 *     nunca `ga_client_id`/`ga_session_id` — senão qualquer link montado à mão
 *     envenenaria a identidade do GA4 gravada no contato;
 *   - o primeiro toque é o pedido MAIS ANTIGO com marcador, e quem decide se grava é
 *     o banco (`fn_estampar_atribuicao_de_anuncio`), não esta varredura;
 *   - `source` do contato NUNCA muda: o LGPD localiza o contato da loja por
 *     `source = 'nuvemshop'` (redact e cópia do titular).
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  LIMITE_DE_PEDIDOS_POR_RODADA,
  carimbarOrigemDosPedidos,
  depsDaOrigemDosPedidosReais,
  utmDaLandingUrl,
  type DepsDaOrigemDosPedidos,
  type PedidoComOrigem,
} from "./origem-dos-pedidos";

const ORG = "11111111-1111-4111-8111-111111111111";

function pedido(sobre: Partial<PedidoComOrigem> = {}): PedidoComOrigem {
  return {
    contactId: "c-1",
    source: "nuvemshop",
    orderedAt: "2026-10-01T10:00:00.000Z",
    landingUrl: "https://loja.example/?utm_source=instagram&utm_campaign=outubro",
    ...sobre,
  };
}

function deps(
  candidatos: PedidoComOrigem[],
  estampar = vi.fn<DepsDaOrigemDosPedidos["estampar"]>(async () => true),
) {
  const d: DepsDaOrigemDosPedidos = { candidatos: vi.fn(async () => candidatos), estampar };
  return { d, estampar };
}

describe("utmDaLandingUrl", () => {
  it("lê UTM e click ids da query string", () => {
    expect(
      utmDaLandingUrl("https://loja.example/produto?utm_source=meta&utm_medium=cpc&fbclid=AbC123&gclid=xyz"),
    ).toEqual({ utm_source: "meta", utm_medium: "cpc", fbclid: "AbC123", gclid: "xyz" });
  });

  it("⭐ ignora ga_client_id e ga_session_id: a URL é do visitante e não pode forjar identidade do GA4", () => {
    expect(
      utmDaLandingUrl("https://loja.example/?utm_source=x&ga_client_id=1234.5678&ga_session_id=999"),
    ).toEqual({ utm_source: "x" });
  });

  it("ignora o que não é chave de campanha (variante, cupom, e-mail)", () => {
    expect(
      utmDaLandingUrl("https://loja.example/?variant=42&cupom=PROMO&email=a@b.com&utm_term=tenis"),
    ).toEqual({ utm_term: "tenis" });
  });

  it("normaliza: chave em maiúsculas, valor com espaços e valor vazio", () => {
    expect(utmDaLandingUrl("https://loja.example/?UTM_SOURCE=%20ig%20&utm_medium=")).toEqual({ utm_source: "ig" });
  });

  it("chave repetida: vale a primeira", () => {
    expect(utmDaLandingUrl("https://loja.example/?utm_source=primeira&utm_source=segunda")).toEqual({
      utm_source: "primeira",
    });
  });

  it("aceita URL relativa e não lança em lixo, vazio ou nulo", () => {
    expect(utmDaLandingUrl("/colecao?utm_campaign=verao")).toEqual({ utm_campaign: "verao" });
    for (const ruim of ["", "   ", "http://", "::::", null, undefined]) {
      expect(utmDaLandingUrl(ruim as string | null | undefined)).toEqual({});
    }
  });

  it("corta o valor no teto de 200 caracteres, como o resto da atribuição", () => {
    const longo = "a".repeat(500);
    expect(utmDaLandingUrl(`https://loja.example/?utm_campaign=${longo}`).utm_campaign).toHaveLength(200);
  });
});

describe("carimbarOrigemDosPedidos", () => {
  it("carimba o contato com a origem do pedido, pelo caminho que já existe", async () => {
    const { d, estampar } = deps([pedido()]);

    const r = await carimbarOrigemDosPedidos(d, ORG);

    expect(estampar).toHaveBeenCalledTimes(1);
    expect(estampar).toHaveBeenCalledWith(ORG, "c-1", {
      utm: { utm_source: "instagram", utm_campaign: "outubro" },
      capturadaEm: "2026-10-01T10:00:00.000Z",
      fonte: "nuvemshop",
    });
    expect(r).toMatchObject({ lidos: 1, carimbados: 1, semOrigem: 0, falhas: 0 });
  });

  it("⭐ o primeiro toque é o pedido MAIS ANTIGO com marcador, mesmo chegando fora de ordem", async () => {
    const { d, estampar } = deps([
      pedido({ orderedAt: "2026-10-20T10:00:00.000Z", landingUrl: "https://loja.example/?utm_source=google" }),
      pedido({ orderedAt: "2026-10-01T10:00:00.000Z", landingUrl: "https://loja.example/?utm_source=instagram" }),
      pedido({ orderedAt: "2026-10-10T10:00:00.000Z", landingUrl: "https://loja.example/?utm_source=email" }),
    ]);

    await carimbarOrigemDosPedidos(d, ORG);

    expect(estampar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(estampar).mock.calls[0]![2]).toMatchObject({ utm: { utm_source: "instagram" } });
  });

  it("um pedido antigo SEM marcador não esconde o mais novo que tem", async () => {
    const { d, estampar } = deps([
      pedido({ orderedAt: "2026-10-01T10:00:00.000Z", landingUrl: "https://loja.example/" }),
      pedido({ orderedAt: "2026-10-05T10:00:00.000Z", landingUrl: "https://loja.example/?fbclid=AbC" }),
    ]);

    await carimbarOrigemDosPedidos(d, ORG);

    expect(vi.mocked(estampar).mock.calls[0]![2]).toMatchObject({ utm: { fbclid: "AbC" }, capturadaEm: "2026-10-05T10:00:00.000Z" });
  });

  it("um contato por chamada: dois contatos, dois carimbos", async () => {
    const { d, estampar } = deps([
      pedido({ contactId: "c-1" }),
      pedido({ contactId: "c-2", landingUrl: "https://loja.example/?gclid=g1" }),
    ]);

    const r = await carimbarOrigemDosPedidos(d, ORG);

    expect(estampar).toHaveBeenCalledTimes(2);
    expect(r.carimbados).toBe(2);
  });

  it("⭐ passa o `source` que o contato JÁ TEM, para o banco não reescrevê-lo (o LGPD acha o contato da loja por ele)", async () => {
    const { d, estampar } = deps([
      pedido({ contactId: "c-loja", source: "nuvemshop" }),
      pedido({ contactId: "c-whats", source: "whatsapp" }),
    ]);

    await carimbarOrigemDosPedidos(d, ORG);

    const fontes = new Map(vi.mocked(estampar).mock.calls.map((c) => [c[1], c[2].fonte]));
    expect(fontes.get("c-loja")).toBe("nuvemshop");
    expect(fontes.get("c-whats")).toBe("whatsapp");
    // E nunca 'site' (o valor que a origem de página grava por padrão).
    expect([...fontes.values()]).not.toContain("site");
  });

  it("contato sem source cai em 'nuvemshop', nunca em 'site'", async () => {
    const { d, estampar } = deps([pedido({ source: null })]);
    await carimbarOrigemDosPedidos(d, ORG);
    expect(vi.mocked(estampar).mock.calls[0]![2].fonte).toBe("nuvemshop");
  });

  it("pedido cujo marcador não rende nenhuma chave válida conta como sem origem e não carimba", async () => {
    const { d, estampar } = deps([pedido({ landingUrl: "https://loja.example/?utm_source=&fbclid=" })]);

    const r = await carimbarOrigemDosPedidos(d, ORG);

    expect(estampar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ lidos: 1, carimbados: 0, semOrigem: 1 });
  });

  it("o banco recusar (contato já tinha origem) é contado como falha da rodada, sem lançar", async () => {
    const { d } = deps([pedido(), pedido({ contactId: "c-2" })], vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true));

    const r = await carimbarOrigemDosPedidos(d, ORG);

    expect(r).toMatchObject({ carimbados: 1, falhas: 1 });
  });

  it("uma exceção ao carimbar um contato não impede os outros", async () => {
    const estampar = vi.fn().mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce(true);
    const { d } = deps([pedido(), pedido({ contactId: "c-2" })], estampar);

    const r = await carimbarOrigemDosPedidos(d, ORG);

    expect(estampar).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ carimbados: 1, falhas: 1 });
  });

  it("sem candidatos, não faz nada", async () => {
    const { d, estampar } = deps([]);
    const r = await carimbarOrigemDosPedidos(d, ORG);
    expect(estampar).not.toHaveBeenCalled();
    expect(r).toEqual({ lidos: 0, carimbados: 0, semOrigem: 0, falhas: 0, truncado: false });
  });

  it("marca `truncado` quando a leitura veio no teto: pode haver mais além", async () => {
    const cheio = Array.from({ length: LIMITE_DE_PEDIDOS_POR_RODADA }, (_, i) => pedido({ contactId: `c-${i}` }));
    const { d } = deps(cheio);
    expect((await carimbarOrigemDosPedidos(d, ORG)).truncado).toBe(true);
  });

  it("pede os candidatos DA ORGANIZAÇÃO e no teto da rodada", async () => {
    const { d } = deps([]);
    await carimbarOrigemDosPedidos(d, ORG);
    expect(d.candidatos).toHaveBeenCalledWith(ORG, LIMITE_DE_PEDIDOS_POR_RODADA);
  });
});

/**
 * A consulta real. Não há PostgREST aqui para provar a semântica, mas a FORMA que o
 * client gera é medida com o client de verdade (sem rede): o filtro de organização, o
 * de contato sem origem (no SQL, senão o contato já carimbado ocuparia o lote para
 * sempre) e os três marcadores.
 */
describe("depsDaOrigemDosPedidosReais — a forma da consulta", () => {
  /** O client real do supabase-js; só o `fetch` é trocado, para registrar a URL e não ir à rede. */
  function consultaGerada() {
    const pedidos: string[] = [];
    const admin = createClient("http://postgrest.invalid", "chave-de-teste", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (entrada) => {
          pedidos.push(String(entrada));
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        },
      },
    });
    return { admin, pedidos };
  }

  it("filtra organização, provedor, anonimização, contato sem origem e os três marcadores", async () => {
    const { admin, pedidos } = consultaGerada();
    const d = depsDaOrigemDosPedidosReais(admin);

    await d.candidatos(ORG, 500);

    expect(pedidos).toHaveLength(1);
    const url = new URL(pedidos[0]!);
    const p = url.searchParams;
    expect(url.pathname).toMatch(/\/orders$/);
    expect(p.get("organization_id")).toBe(`eq.${ORG}`);
    expect(p.get("external_provider")).toBe("eq.nuvemshop");
    expect(p.get("is_anonymized")).toBe("eq.false");
    expect(p.get("contact_id")).toBe("not.is.null");
    // O filtro do contato é do SQL, não de quem lê: contato já carimbado sai do lote.
    expect(p.get("contacts.source_metadata->>ad_platform")).toBe("is.null");
    expect(p.get("select")).toContain("contacts!inner");
    const ou = p.get("or") ?? "";
    for (const marcador of ["utm_", "fbclid=", "gclid="]) expect(ou).toContain(marcador);
    expect(p.get("order")).toBe("ordered_at.asc");
    expect(p.get("limit")).toBe("500");
  });
});
