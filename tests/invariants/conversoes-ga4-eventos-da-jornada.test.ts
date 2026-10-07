import { beforeAll, describe, expect, it } from "vitest";
import {
  VALORES_DE_EVENTO_DE_ETAPA_GA4,
  VALORES_DE_EVENTO_DE_VENDA_GA4,
} from "@/lib/conversoes/regras-ga4";
import { GOV_ORG, GOV_STAGE, seedGov, sql } from "./gov-helpers";

/**
 * Migration 0904: os eventos de etapa da jornada do comprador (`view_item`,
 * `add_to_cart`, `schedule`, `close_unconvert_lead`) entram no CHECK de
 * `ga4_conversion_rules.ga4_event`.
 *
 * O vocabulário do TypeScript é IMPORTADO (`regras-ga4.ts`), nunca transcrito:
 * uma cópia manual aqui seria a terceira lista, e o par passaria verde com o
 * TypeScript e o banco divergindo. Por isso a coluna fica fora de
 * `vocabulario-banco-x-typescript.test.ts`, cujo extrator lê union type ou
 * tupla de literais — e o símbolo daqui é uma tupla de `{ valor, rotulo }`.
 */

beforeAll(seedGov);

const NOVOS = ["view_item", "add_to_cart", "schedule", "close_unconvert_lead"] as const;

/** Os literais do CHECK nomeado, lidos do catálogo — o que o banco aceita de fato. */
function literaisDoCheck(tabela: string, constraint: string): string[] {
  const def = sql(`select pg_get_constraintdef(k.oid)
      from pg_constraint k join pg_class c on c.oid = k.conrelid
     where c.relname = '${tabela}' and k.conname = '${constraint}';`).trim();
  expect(def, `${tabela}.${constraint} não existe`).not.toBe("");
  return [...def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]!).sort();
}

function inserirRegra(ga4Event: string): string {
  return sql(`begin;
    insert into public.ga4_conversion_rules(organization_id,stage_id,event_name,ga4_event)
    values ('${GOV_ORG}','${GOV_STAGE}','GA4Etapa:${GOV_STAGE}','${ga4Event}');
    select ga4_event from public.ga4_conversion_rules where organization_id='${GOV_ORG}';
    rollback;`);
}

describe("conversões GA4: eventos de etapa da jornada (0904)", () => {
  for (const evento of NOVOS) {
    it(`regra aceita ${evento}`, () => {
      expect(inserirRegra(evento)).toContain(evento);
    });
  }

  it("regra continua recusando evento desconhecido", () => {
    expect(() => inserirRegra("page_view")).toThrow(/ga4_conversion_rules_evento_conhecido/);
  });

  it("o CHECK da regra aceita exatamente o vocabulário de etapa do TypeScript", () => {
    expect(literaisDoCheck("ga4_conversion_rules", "ga4_conversion_rules_evento_conhecido")).toEqual(
      [...VALORES_DE_EVENTO_DE_ETAPA_GA4].sort(),
    );
  });

  it("o CHECK do evento de venda da conexão aceita exatamente o vocabulário de venda do TypeScript", () => {
    expect(
      literaisDoCheck("ad_platform_connections", "ad_platform_connections_ga4_won_event_check"),
    ).toEqual([...VALORES_DE_EVENTO_DE_VENDA_GA4].sort());
  });
});
