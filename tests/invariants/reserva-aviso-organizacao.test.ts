import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { lastLine, sql } from './gov-helpers';

const orgA = '70000000-0000-4000-8000-000000000001';
const orgB = '70000000-0000-4000-8000-000000000002';
const userA = '70000000-1111-4000-8000-000000000001';
const userB = '70000000-1111-4000-8000-000000000002';
const contatoA = '70000000-2222-4000-8000-000000000001';
const contatoB = '70000000-2222-4000-8000-000000000002';

beforeAll(() => {
  sql(`insert into auth.users (id,email) values ('${userA}','reserva-a@invariant.test'),('${userB}','reserva-b@invariant.test') on conflict do nothing;
    insert into organizations (id,slug,legal_name,display_name) values ('${orgA}','reserva-70-a','A','A'),('${orgB}','reserva-70-b','B','B') on conflict do nothing;
    insert into user_organizations (user_id,organization_id,role,accepted_at) values ('${userA}','${orgA}','agent',now()),('${userB}','${orgB}','agent',now()) on conflict do nothing;
    insert into contacts (id,organization_id,name,phone_number) values ('${contatoA}','${orgA}','A','+5511900000071'),('${contatoB}','${orgB}','B','+5511900000072') on conflict do nothing;
    insert into reservas_aviso_organizacao (organization_id,contact_id,inicio_periodo,token,estado,expira_em)
    values ('${orgA}','${contatoA}','2026-01-01','${userA}','enviada',now()),('${orgB}','${contatoB}','2026-01-01','${userB}','incerta',now()) on conflict do nothing;`);
});

describe('reserva do aviso: isolamento e permissões', () => {
  it('cada organização enxerga somente sua linha', () => {
    for (const [user, org] of [[userA, orgA], [userB, orgB]]) {
      expect(lastLine(sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${user}"}',false); select string_agg(organization_id::text, ',') from reservas_aviso_organizacao;`))).toBe(org);
    }
  });
  it('usuário autenticado e anônimo não podem modificar reservas', () => {
    expect(lastLine(sql("select has_table_privilege('authenticated','public.reservas_aviso_organizacao','INSERT') or has_table_privilege('anon','public.reservas_aviso_organizacao','SELECT')"))).toBe('f');
  });
  it('só retomada pré-envio expirada pode ser reservada novamente', () => {
    const periodo = '2026-01-02T00:00:00Z';
    sql(`insert into reservas_aviso_organizacao (organization_id,contact_id,inicio_periodo,token,estado,expira_em)
      values ('${orgA}','${contatoA}','${periodo}','${userA}','reservada',now() - interval '1 minute') on conflict do nothing;`);
    const tentativa = (token: string) => `insert into reservas_aviso_organizacao (organization_id,contact_id,inicio_periodo,token,estado,expira_em)
      values ('${orgA}','${contatoA}','${periodo}','${token}','reservada',now() + interval '5 minutes')
      on conflict (organization_id,contact_id,inicio_periodo) do update set token=excluded.token,estado='reservada',expira_em=excluded.expira_em
      where reservas_aviso_organizacao.estado='falha' or (reservas_aviso_organizacao.estado='reservada' and reservas_aviso_organizacao.expira_em < now()) returning token;`;
    expect(sql(tentativa(userB)).split("\n")).toContain(userB);
    sql(`update reservas_aviso_organizacao set estado='incerta',expira_em=now() - interval '1 hour' where organization_id='${orgA}' and contact_id='${contatoA}' and inicio_periodo='${periodo}';`);
    sql(tentativa(userA));
    expect(lastLine(sql(`select token from reservas_aviso_organizacao where organization_id='${orgA}' and contact_id='${contatoA}' and inicio_periodo='${periodo}'`))).toBe(userB);
  });
  it('duas sessões concorrentes obtêm uma única reserva', async () => {
    const container = process.env.TEST_DB_CONTAINER;
    if (!container) throw new Error('TEST_DB_CONTAINER ausente');
    const executar = promisify(execFile);
    const query = (token: string) => `insert into reservas_aviso_organizacao (organization_id,contact_id,inicio_periodo,token,estado,expira_em)
      values ('${orgA}','${contatoA}','2026-01-03','${token}','reservada',now() + interval '5 minutes')
      on conflict (organization_id,contact_id,inicio_periodo) do update set token=excluded.token,estado='reservada',expira_em=excluded.expira_em
      where reservas_aviso_organizacao.estado='falha' or (reservas_aviso_organizacao.estado='reservada' and reservas_aviso_organizacao.expira_em < now()) returning token;`;
    const resultados = await Promise.all([userA, userB].map(token => executar('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAq', '-c', query(token)])));
    expect(resultados.filter(r => r.stdout.trim() !== '')).toHaveLength(1);
  });
  it('unicidade por contato e período vale no banco', () => {
    expect(lastLine(sql(`select count(*) from pg_constraint where conrelid = 'public.reservas_aviso_organizacao'::regclass and contype = 'p'`))).toBe('1');
  });
});
