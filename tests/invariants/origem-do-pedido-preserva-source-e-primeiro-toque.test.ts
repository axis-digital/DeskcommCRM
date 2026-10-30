import { beforeAll, describe, expect, it } from "vitest";

import { GOV_CONTACT_1, GOV_CONTACT_2, GOV_ORG, lastLine, seedGov, sql } from "./gov-helpers";

/**
 * A origem do contato lida da `landing_url` do pedido da loja
 * (`lib/nuvemshop/sync/origem-dos-pedidos.ts`) carimba pela MESMA função que já
 * existe, `fn_estampar_atribuicao_de_anuncio`. Este invariante prova no banco as
 * quatro coisas em que essa escolha se apoia:
 *
 *  1. o carimbo com `p_platform = 'nuvemshop'` NÃO muda `source` nem apaga as chaves
 *     que o contato já tinha (`store_id`, `customer_id`) — o LGPD localiza o contato
 *     da loja por `source = 'nuvemshop'`;
 *  2. PRIMEIRO TOQUE: um segundo carimbo (outro pedido, outra campanha) não
 *     sobrescreve o primeiro;
 *  3. contato que já veio de anúncio pago não é tocado;
 *  4. CONTROLE NEGATIVO — com `p_platform = 'site'` (o padrão de quem chega pelo
 *     WhatsApp) o banco REESCREVE `source`, e o contato some da busca do LGPD. É o
 *     motivo de a varredura repassar o `source` que o contato já tem; se a função
 *     um dia passar a preservá-lo, este caso avisa.
 *
 * E mede a semântica da SELEÇÃO que a varredura faz (pedido com marcador, de contato
 * sem origem, do mais antigo ao mais novo) em SQL real. A forma da consulta PostgREST
 * correspondente é medida em `origem-dos-pedidos.test.ts`.
 */

const PREFIXO = "inv-origem-";

function comoServiceRole(plataforma: string, contato: string, metadata: Record<string, unknown>): string {
  return sql(`
    set role service_role;
    select public.fn_estampar_atribuicao_de_anuncio(
      '${GOV_ORG}', '${contato}', '${plataforma}', '${JSON.stringify(metadata)}'::jsonb
    );
  `);
}

/** O contato num estado conhecido: a suíte roda repetidas vezes sobre o MESMO banco. */
function preparar(contato: string, source: string, metadata: Record<string, unknown>): void {
  sql(`
    update public.contacts
       set source = '${source}', source_metadata = '${JSON.stringify(metadata)}'::jsonb
     where id = '${contato}';
  `);
}

function ler(contato: string, expressao: string): string {
  return lastLine(sql(`select coalesce((${expressao})::text, 'AUSENTE') from public.contacts where id = '${contato}';`));
}

const META_DA_LOJA = { store_id: "loja-1", customer_id: "cli-1" };

beforeAll(() => {
  seedGov();
});

describe("origem do pedido: preserva source, o primeiro toque e quem já veio de anúncio", () => {
  it("⭐ com p_platform = 'nuvemshop', source e as chaves da loja ficam, e a origem entra", () => {
    preparar(GOV_CONTACT_1, "nuvemshop", META_DA_LOJA);

    comoServiceRole("nuvemshop", GOV_CONTACT_1, {
      ad_platform: "site",
      ad_source_id: null,
      origem: "site",
      origem_via: "pedido_nuvemshop",
      utm_source: "instagram",
    });

    expect(ler(GOV_CONTACT_1, "source")).toBe("nuvemshop");
    expect(ler(GOV_CONTACT_1, "source_metadata->>'store_id'")).toBe("loja-1");
    expect(ler(GOV_CONTACT_1, "source_metadata->>'customer_id'")).toBe("cli-1");
    expect(ler(GOV_CONTACT_1, "source_metadata->>'ad_platform'")).toBe("site");
    expect(ler(GOV_CONTACT_1, "source_metadata->>'utm_source'")).toBe("instagram");
    expect(ler(GOV_CONTACT_1, "source_metadata->>'origem_via'")).toBe("pedido_nuvemshop");
  });

  it("o LGPD continua achando o contato da loja depois do carimbo (a busca por source = 'nuvemshop' + id do cliente)", () => {
    preparar(GOV_CONTACT_1, "nuvemshop", META_DA_LOJA);
    comoServiceRole("nuvemshop", GOV_CONTACT_1, { ad_platform: "site", utm_source: "instagram" });

    const achados = lastLine(
      sql(`
        select count(*) from public.contacts
         where organization_id = '${GOV_ORG}' and source = 'nuvemshop'
           and source_metadata->>'customer_id' = 'cli-1' and id = '${GOV_CONTACT_1}';
      `),
    );
    expect(achados).toBe("1");
  });

  it("⭐ primeiro toque: o segundo carimbo (outro pedido, outra campanha) não sobrescreve o primeiro", () => {
    preparar(GOV_CONTACT_1, "nuvemshop", META_DA_LOJA);

    comoServiceRole("nuvemshop", GOV_CONTACT_1, { ad_platform: "site", utm_source: "instagram" });
    comoServiceRole("nuvemshop", GOV_CONTACT_1, { ad_platform: "site", utm_source: "google", utm_campaign: "outra" });

    expect(ler(GOV_CONTACT_1, "source_metadata->>'utm_source'")).toBe("instagram");
    expect(ler(GOV_CONTACT_1, "source_metadata->>'utm_campaign'")).toBe("AUSENTE");
  });

  it("contato que já veio de anúncio pago não é tocado", () => {
    preparar(GOV_CONTACT_1, "meta_ads", { ad_platform: "meta_ads", ad_id: "120210000000000" });

    comoServiceRole("meta_ads", GOV_CONTACT_1, { ad_platform: "site", utm_source: "instagram" });

    expect(ler(GOV_CONTACT_1, "source_metadata->>'ad_platform'")).toBe("meta_ads");
    expect(ler(GOV_CONTACT_1, "source_metadata->>'utm_source'")).toBe("AUSENTE");
  });

  it("CONTROLE NEGATIVO: com p_platform = 'site' o banco reescreve source e o contato some da busca do LGPD", () => {
    preparar(GOV_CONTACT_2, "nuvemshop", META_DA_LOJA);

    comoServiceRole("site", GOV_CONTACT_2, { ad_platform: "site", utm_source: "instagram" });

    expect(ler(GOV_CONTACT_2, "source")).toBe("site");
    const achados = lastLine(
      sql(`
        select count(*) from public.contacts
         where organization_id = '${GOV_ORG}' and source = 'nuvemshop' and id = '${GOV_CONTACT_2}';
      `),
    );
    expect(achados).toBe("0");
  });
});

describe("a seleção da varredura, em SQL real", () => {
  function pedido(sufixo: string, contato: string, quando: string, landing: string | null, anonimizado = false): string {
    const payload = landing === null ? "{}" : JSON.stringify({ landing_url: landing });
    return `insert into public.orders
        (organization_id, external_id, external_provider, status, total_cents, ordered_at, payload, contact_id, is_anonymized)
      values ('${GOV_ORG}', '${PREFIXO}${sufixo}', 'nuvemshop', 'paid', 1000, '${quando}', '${payload}'::jsonb, '${contato}', ${anonimizado});`;
  }

  it("pega pedido com marcador de contato SEM origem, do mais antigo ao mais novo, e deixa o resto", () => {
    preparar(GOV_CONTACT_1, "nuvemshop", META_DA_LOJA); // sem origem: candidato
    preparar(GOV_CONTACT_2, "nuvemshop", { ...META_DA_LOJA, ad_platform: "meta_ads" }); // já tem origem: fora

    sql(`
      delete from public.orders where organization_id = '${GOV_ORG}' and external_id like '${PREFIXO}%';
      ${pedido("novo", GOV_CONTACT_1, "2026-10-10T10:00:00Z", "https://loja.example/?fbclid=AbC")}
      ${pedido("antigo", GOV_CONTACT_1, "2026-10-01T10:00:00Z", "https://loja.example/?utm_source=ig&utm_campaign=x")}
      ${pedido("sem-marcador", GOV_CONTACT_1, "2026-10-02T10:00:00Z", "https://loja.example/produto?variant=42")}
      ${pedido("sem-url", GOV_CONTACT_1, "2026-10-03T10:00:00Z", null)}
      ${pedido("anonimizado", GOV_CONTACT_1, "2026-10-04T10:00:00Z", "https://loja.example/?gclid=g", true)}
      ${pedido("contato-com-origem", GOV_CONTACT_2, "2026-10-05T10:00:00Z", "https://loja.example/?utm_source=ig")}
    `);

    const ordem = lastLine(
      sql(`
        select coalesce(string_agg(replace(o.external_id, '${PREFIXO}', ''), ',' order by o.ordered_at asc), 'NENHUM')
          from public.orders o
          join public.contacts c on c.id = o.contact_id
         where o.organization_id = '${GOV_ORG}'
           and o.external_provider = 'nuvemshop'
           and o.is_anonymized = false
           and o.contact_id is not null
           and c.source_metadata->>'ad_platform' is null
           and (   o.payload->>'landing_url' ilike '%utm\\_%=%'
                or o.payload->>'landing_url' ilike '%fbclid=%'
                or o.payload->>'landing_url' ilike '%gclid=%')
           and o.external_id like '${PREFIXO}%';
      `),
    );

    expect(ordem).toBe("antigo,novo");
    sql(`delete from public.orders where organization_id = '${GOV_ORG}' and external_id like '${PREFIXO}%';`);
  });
});
