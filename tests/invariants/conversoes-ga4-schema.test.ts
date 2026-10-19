import { beforeAll, describe, expect, it } from "vitest";
import { GOV_ORG, GOV_STAGE, GOV_LEAD, seedGov, sql } from "./gov-helpers";

const OUTRA = "99999999-9999-4999-8999-999999999998";

beforeAll(seedGov);

describe("conversões GA4: contrato do banco", () => {
  it("aceita a conexão ga4 com o evento de venda", () => {
    expect(
      sql(`begin;
      insert into public.ad_platform_connections(organization_id,platform,dataset_id,ga4_won_event,enabled)
      values ('${GOV_ORG}','ga4','G-TESTE1234','purchase',true);
      select platform, ga4_won_event from public.ad_platform_connections
        where organization_id='${GOV_ORG}' and platform='ga4';
      rollback;`),
    ).toContain("ga4|purchase");
  });

  it("recusa evento de venda fora do vocabulário", () => {
    expect(() =>
      sql(`insert into public.ad_platform_connections(organization_id,platform,ga4_won_event)
           values ('${GOV_ORG}','ga4','compra');`),
    ).toThrow(/ad_platform_connections_ga4_won_event_check/);
  });

  it("regra só aceita evento GA4 conhecido e chave GA4Etapa", () => {
    expect(() =>
      sql(`insert into public.ga4_conversion_rules(organization_id,stage_id,event_name,ga4_event)
           values ('${GOV_ORG}','${GOV_STAGE}','GA4Etapa:${GOV_STAGE}','page_view');`),
    ).toThrow(/ga4_conversion_rules_evento_conhecido/);
    expect(() =>
      sql(`insert into public.ga4_conversion_rules(organization_id,stage_id,event_name,ga4_event)
           values ('${GOV_ORG}','${GOV_STAGE}','MetaEtapa:${GOV_STAGE}','qualify_lead');`),
    ).toThrow(/ga4_conversion_rules_evento_do_livro/);
  });

  it("regra não aceita etapa de outra organização", () => {
    expect(() =>
      sql(`begin;
      insert into public.organizations(id,slug,legal_name,display_name) values ('${OUTRA}','org-ga4','Outra','Outra');
      insert into public.ga4_conversion_rules(organization_id,stage_id,event_name,ga4_event)
      values ('${OUTRA}','${GOV_STAGE}','GA4Etapa:${GOV_STAGE}','qualify_lead');
      rollback;`),
    ).toThrow(/ga4_conversion_rules_stage_org_fk/);
  });

  it("configured_at só anda quando a regra muda de verdade", () => {
    expect(
      sql(`begin;
      insert into public.ga4_conversion_rules(organization_id,stage_id,event_name,ga4_event,configured_at)
      values ('${GOV_ORG}','${GOV_STAGE}','GA4Etapa:${GOV_STAGE}','qualify_lead','2000-01-01');
      update public.ga4_conversion_rules set updated_by=null where organization_id='${GOV_ORG}';
      select configured_at='2000-01-01' from public.ga4_conversion_rules where organization_id='${GOV_ORG}';
      update public.ga4_conversion_rules set ga4_event='working_lead' where organization_id='${GOV_ORG}';
      select configured_at=now() from public.ga4_conversion_rules where organization_id='${GOV_ORG}';
      rollback;`),
    ).toSatisfy((out: string) => out.split("\n").filter((l) => l.trim() === "t").length === 2);
  });

  it("livro-razão guarda o retrato do evento GA4", () => {
    expect(
      sql(`begin;
      insert into public.ad_conversion_dispatches(organization_id,lead_id,platform,event_name,status,ga4_event_name)
      values ('${GOV_ORG}','${GOV_LEAD}','ga4','GA4Etapa:${GOV_STAGE}','sent','qualify_lead');
      select ga4_event_name from public.ad_conversion_dispatches where organization_id='${GOV_ORG}' and platform='ga4';
      rollback;`),
    ).toContain("qualify_lead");
  });

  it("papéis do navegador não leem regras nem executam o gatilho", () => {
    expect(
      sql(`select has_table_privilege('anon','public.ga4_conversion_rules','select'),
                  has_table_privilege('authenticated','public.ga4_conversion_rules','select'),
                  has_function_privilege('anon','public.fn_marcar_configuracao_regra_ga4()','execute'),
                  has_function_privilege('authenticated','public.fn_marcar_configuracao_regra_ga4()','execute');`),
    ).toContain("f|f|f|f");
  });
});
