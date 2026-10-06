/**
 * O reenvio das linhas do GA4 e da venda sem origem (forward-fix da 0902).
 *
 * A 0902 gravou no livro-razão `GA4:Venda`, `GA4Etapa:<uuid>` e
 * `SemOrigem:<plataforma>:Purchase`, mas a porta de reenvio
 * (`fn_solicitar_reenvio_conversao`) só conhecia os nomes do Google e da Meta:
 * devolvia `false` para todos eles, e o guarda de registro exigia
 * `google_action_id` de qualquer evento que não fosse `Purchase`. O botão
 * "Verificar ou tentar novamente" do Histórico nunca alcançava o consumidor.
 *
 * Os guardas medidos aqui espelham o que cada consumidor exige para reenviar:
 *   - GA4 (`ga4.handler.ts`): o RETRATO — `event_occurred_at` e `ga4_event_name`;
 *   - sem origem (`envio.handler.ts`): o negócio continua ganho, como o `Purchase`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { GOV_ORG, GOV_LEAD, GOV_STAGE, seedGov, sql } from "./gov-helpers";

beforeAll(seedGov);

const OUTRA_ORG = "00000000-0000-4000-8000-000000000000";

const pedir = (evento: string, org = GOV_ORG) =>
  `public.fn_solicitar_reenvio_conversao('${org}','${GOV_LEAD}','${evento}')::text`;

const contarPedidos = (evento: string) =>
  `(select count(*) from public.event_log where organization_id='${GOV_ORG}' and entity_id='${GOV_LEAD}'
     and event_type='ad_conversion.retry_requested' and payload->>'event_name'='${evento}')::text`;

const linha = (plataforma: string, evento: string, status: string) =>
  `insert into public.ad_conversion_dispatches(organization_id,lead_id,platform,event_name,status)
   values ('${GOV_ORG}','${GOV_LEAD}','${plataforma}','${evento}','${status}');`;

describe("reenvio do GA4 (GA4:Venda e GA4Etapa)", () => {
  for (const evento of ["GA4:Venda", `GA4Etapa:${GOV_STAGE}`]) {
    it(`${evento}: agenda um único pedido para a linha com retrato que não saiu`, () => {
      const out = sql(`begin;
        insert into public.ad_conversion_dispatches(organization_id,lead_id,platform,event_name,status,reason,event_occurred_at,ga4_event_name)
        values ('${GOV_ORG}','${GOV_LEAD}','ga4','${evento}','error','permanente',now(),'close_convert_lead');
        select 'outra_org=' || ${pedir(evento, OUTRA_ORG)};
        select 'primeiro=' || ${pedir(evento)};
        select 'repetido=' || ${pedir(evento)};
        select 'pedidos=' || ${contarPedidos(evento)};
        select 'motivo=' || reason from public.ad_conversion_dispatches
          where organization_id='${GOV_ORG}' and lead_id='${GOV_LEAD}' and event_name='${evento}';
        rollback;`);
      expect(out).toContain("outra_org=false");
      expect(out).toContain("primeiro=true");
      expect(out).toContain("repetido=false");
      expect(out).toContain("pedidos=1");
      expect(out).toContain("motivo=reprocessamento_solicitado");
    });

    it(`${evento}: sem o retrato (quando + qual evento) não agenda`, () => {
      const out = sql(`begin;
        insert into public.ad_conversion_dispatches(organization_id,lead_id,platform,event_name,status,event_occurred_at)
        values ('${GOV_ORG}','${GOV_LEAD}','ga4','${evento}','error',now());
        select 'sem_nome=' || ${pedir(evento)};
        delete from public.ad_conversion_dispatches
          where organization_id='${GOV_ORG}' and lead_id='${GOV_LEAD}' and event_name='${evento}';
        insert into public.ad_conversion_dispatches(organization_id,lead_id,platform,event_name,status,ga4_event_name)
        values ('${GOV_ORG}','${GOV_LEAD}','ga4','${evento}','error','qualify_lead');
        select 'sem_quando=' || ${pedir(evento)};
        select 'pedidos=' || ${contarPedidos(evento)};
        rollback;`);
      expect(out).toContain("sem_nome=false");
      expect(out).toContain("sem_quando=false");
      expect(out).toContain("pedidos=0");
    });

    it(`${evento}: linha já entregue não é reenviada`, () => {
      const out = sql(`begin;
        insert into public.ad_conversion_dispatches(organization_id,lead_id,platform,event_name,status,event_occurred_at,ga4_event_name)
        values ('${GOV_ORG}','${GOV_LEAD}','ga4','${evento}','sent',now(),'close_convert_lead');
        select 'entregue=' || ${pedir(evento)};
        select 'pedidos=' || ${contarPedidos(evento)};
        rollback;`);
      expect(out).toContain("entregue=false");
      expect(out).toContain("pedidos=0");
    });
  }

  it("variação desconhecida do nome não agenda", () => {
    const out = sql(`begin;
      insert into public.ad_conversion_dispatches(organization_id,lead_id,platform,event_name,status,event_occurred_at,ga4_event_name)
      values ('${GOV_ORG}','${GOV_LEAD}','ga4','GA4:Compra','error',now(),'purchase');
      select 'desconhecido=' || ${pedir("GA4:Compra")};
      rollback;`);
    expect(out).toContain("desconhecido=false");
  });
});

describe("reenvio da venda sem origem (SemOrigem:<plataforma>:Purchase)", () => {
  for (const plataforma of ["meta_ads", "google_ads"]) {
    const evento = `SemOrigem:${plataforma}:Purchase`;

    it(`${plataforma}: negócio ganho com envio que falhou agenda um único pedido`, () => {
      const out = sql(`begin;
        update public.crm_leads set status='won', closed_at=now() where id='${GOV_LEAD}';
        ${linha(plataforma, evento, "error")}
        select 'outra_org=' || ${pedir(evento, OUTRA_ORG)};
        select 'primeiro=' || ${pedir(evento)};
        select 'repetido=' || ${pedir(evento)};
        select 'pedidos=' || ${contarPedidos(evento)};
        rollback;`);
      expect(out).toContain("outra_org=false");
      expect(out).toContain("primeiro=true");
      expect(out).toContain("repetido=false");
      expect(out).toContain("pedidos=1");
    });

    it(`${plataforma}: negócio que deixou de ser ganho não reenvia a venda`, () => {
      const out = sql(`begin;
        update public.crm_leads set status='open', closed_at=null where id='${GOV_LEAD}';
        ${linha(plataforma, evento, "error")}
        select 'aberto=' || ${pedir(evento)};
        rollback;`);
      expect(out).toContain("aberto=false");
    });

    it(`${plataforma}: venda já entregue não é reenviada`, () => {
      const out = sql(`begin;
        update public.crm_leads set status='won', closed_at=now() where id='${GOV_LEAD}';
        ${linha(plataforma, evento, "sent")}
        select 'entregue=' || ${pedir(evento)};
        select 'pedidos=' || ${contarPedidos(evento)};
        rollback;`);
      expect(out).toContain("entregue=false");
      expect(out).toContain("pedidos=0");
    });
  }

  it("plataforma fora das duas do fallback não agenda", () => {
    const out = sql(`begin;
      update public.crm_leads set status='won', closed_at=now() where id='${GOV_LEAD}';
      ${linha("ga4", "SemOrigem:ga4:Purchase", "error")}
      select 'ga4=' || ${pedir("SemOrigem:ga4:Purchase")};
      rollback;`);
    expect(out).toContain("ga4=false");
  });
});

describe("a porta continua fechada para o navegador", () => {
  it("anon e authenticated não executam a função de três argumentos", () => {
    expect(
      sql(`select has_function_privilege('anon','public.fn_solicitar_reenvio_conversao(uuid,uuid,text)','execute'),
        has_function_privilege('authenticated','public.fn_solicitar_reenvio_conversao(uuid,uuid,text)','execute'),
        has_function_privilege('service_role','public.fn_solicitar_reenvio_conversao(uuid,uuid,text)','execute');`),
    ).toBe("f|f|t");
  });
});
