import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_AGENT_B,
  GOV_CONTACT_PROBE,
  GOV_MANAGER,
  GOV_ORG,
  GOV_PIPELINE,
  GOV_STAGE,
  GOV_VIEWER,
  countAs,
  seedGov,
  sql,
} from "./gov-helpers";

// Dados sintéticos; cada arquivo recebe o próprio banco do baseline.
const LEAD_A = "99071111-0000-4000-8000-000000000001";
const LEAD_B = "99071111-0000-4000-8000-000000000002";
const LEAD_FILA = "99071111-0000-4000-8000-000000000003";
const OUTRA_ORG = "99072222-0000-4000-8000-000000000001";
const VIZINHO = "99072222-1111-4000-8000-000000000001";
const VENDA_A = "99073333-0000-4000-8000-000000000001";
const VENDA_B = "99073333-0000-4000-8000-000000000002";
const VENDA_FILA = "99073333-0000-4000-8000-000000000003";
const VENDA_CONTATO = "99073333-0000-4000-8000-000000000004";

function visibilidade(modo: "own" | "own_and_unassigned" | "all") {
  sql(`update organizations set settings = jsonb_build_object('visibility_mode', '${modo}') where id = '${GOV_ORG}';`);
}

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id,email) values ('${VIZINHO}','vendas-9907@invariant.test');
    insert into organizations (id,slug,legal_name,display_name)
      values ('${OUTRA_ORG}','vendas-9907-vizinha','Vizinha sintética','Vizinha sintética');
    insert into user_organizations (organization_id,user_id,role,accepted_at)
      values ('${OUTRA_ORG}','${VIZINHO}','admin',now());
    insert into crm_leads (id,organization_id,pipeline_id,stage_id,title,owner_user_id) values
      ('${LEAD_A}','${GOV_ORG}','${GOV_PIPELINE}','${GOV_STAGE}','Negócio A','${GOV_AGENT_A}'),
      ('${LEAD_B}','${GOV_ORG}','${GOV_PIPELINE}','${GOV_STAGE}','Negócio B','${GOV_AGENT_B}'),
      ('${LEAD_FILA}','${GOV_ORG}','${GOV_PIPELINE}','${GOV_STAGE}','Negócio da fila',null);
    insert into vendas_registradas (id,organization_id,lead_id,valor_cents,data,observacao) values
      ('${VENDA_A}','${GOV_ORG}','${LEAD_A}',1000,'2026-11-25','Nota sintética A'),
      ('${VENDA_B}','${GOV_ORG}','${LEAD_B}',2000,'2026-11-25','Nota sintética B'),
      ('${VENDA_FILA}','${GOV_ORG}','${LEAD_FILA}',3000,'2026-11-25','Nota sintética da fila');
    insert into vendas_registradas (id,organization_id,contact_id,valor_cents,data)
      values ('${VENDA_CONTATO}','${GOV_ORG}','${GOV_CONTACT_PROBE}',4000,'2026-11-25');
  `);
});

describe("vendas ligadas a negócio herdam a visibilidade do pai", () => {
  it.each(["own", "own_and_unassigned"] as const)("%s: atendente não lê nem soma a venda do negócio oculto", (modo) => {
    visibilidade(modo);
    expect(countAs(GOV_AGENT_A, `select count(*) from crm_leads where id='${LEAD_B}'`)).toBe(0);
    expect(countAs(GOV_AGENT_A, `select count(*) from vendas_registradas where id='${VENDA_B}'`)).toBe(0);
    expect(countAs(GOV_AGENT_A, `select coalesce(sum(valor_cents),0) from vendas_registradas where id in ('${VENDA_A}','${VENDA_B}')`)).toBe(1000);
    expect(countAs(GOV_AGENT_A, `select count(*) from vendas_registradas where id='${VENDA_A}'`)).toBe(1);
  });

  it.each([["own", 0], ["own_and_unassigned", 1]] as const)("%s: venda da fila segue a visibilidade do negócio sem dono", (modo, esperado) => {
    visibilidade(modo);
    expect(countAs(GOV_AGENT_A, `select count(*) from vendas_registradas where id='${VENDA_FILA}'`)).toBe(esperado);
  });

  it("all: atendente continua lendo as vendas dos demais negócios da organização", () => {
    visibilidade("all");
    expect(countAs(GOV_AGENT_A, `select count(*) from vendas_registradas where id in ('${VENDA_A}','${VENDA_B}','${VENDA_FILA}')`)).toBe(3);
  });

  it.each([GOV_MANAGER, GOV_VIEWER])("gestor/leitor mantém a leitura de toda a organização (%s)", (usuario) => {
    visibilidade("own");
    expect(countAs(usuario, `select count(*) from vendas_registradas where id in ('${VENDA_A}','${VENDA_B}','${VENDA_FILA}')`)).toBe(3);
  });

  it("venda só de contato mantém a leitura por organização, sem confundir negócio oculto com negócio ausente", () => {
    visibilidade("own");
    expect(countAs(GOV_AGENT_A, `select count(*) from vendas_registradas where id='${VENDA_CONTATO}'`)).toBe(1);
    expect(countAs(VIZINHO, `select count(*) from vendas_registradas where organization_id='${GOV_ORG}'`)).toBe(0);
  });
});

describe("apagar o pai preserva o registro financeiro", () => {
  function venda(id: string, lead: string | null, contato: string | null) {
    sql(`insert into vendas_registradas (id,organization_id,lead_id,contact_id,valor_cents,data)
      values ('${id}','${GOV_ORG}',${lead ? `'${lead}'` : "null"},${contato ? `'${contato}'` : "null"},18000,'2026-11-25');`);
  }

  function contato(id: string) {
    sql(`insert into contacts (id,organization_id,name) values ('${id}','${GOV_ORG}','Contato sintético para exclusão');`);
  }

  function lead(id: string) {
    sql(`insert into crm_leads (id,organization_id,pipeline_id,stage_id,title)
      values ('${id}','${GOV_ORG}','${GOV_PIPELINE}','${GOV_STAGE}','Negócio sintético para exclusão');`);
  }

  function preservada(id: string) {
    expect(sql(`select lead_id is null,contact_id is null,valor_cents from vendas_registradas where id='${id}'`)).toBe("t|t|18000");
  }

  it("venda só de contato: a FK pode tornar nula a última referência", () => {
    const c = "99074444-0000-4000-8000-000000000001";
    const v = "99075555-0000-4000-8000-000000000001";
    contato(c); venda(v, null, c);
    sql(`delete from contacts where id='${c}'`);
    preservada(v);
  });

  it("venda só de negócio: a FK pode tornar nula a última referência", () => {
    const l = "99074444-0000-4000-8000-000000000002";
    const v = "99075555-0000-4000-8000-000000000002";
    lead(l); venda(v, l, null);
    sql(`delete from crm_leads where id='${l}'`);
    preservada(v);
  });

  it("as duas referências podem desaparecer em momentos diferentes", () => {
    const c = "99074444-0000-4000-8000-000000000003";
    const l = "99074444-0000-4000-8000-000000000004";
    const v = "99075555-0000-4000-8000-000000000003";
    contato(c); lead(l); venda(v, l, c);
    sql(`delete from contacts where id='${c}'`);
    expect(sql(`select contact_id is null,lead_id is not null from vendas_registradas where id='${v}'`)).toBe("t|t");
    sql(`delete from crm_leads where id='${l}'`);
    preservada(v);
  });
});
