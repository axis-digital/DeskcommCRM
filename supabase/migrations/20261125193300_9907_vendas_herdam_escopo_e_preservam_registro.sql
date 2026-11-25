-- manifest: Vendas ligadas a um negócio herdam sua visibilidade; apagar o último vínculo preserva o registro financeiro em vez de bloquear ON DELETE SET NULL.
-- A API continua exigindo negócio ou contato na criação. O banco permite que
-- ambos se tornem nulos depois, como as duas FKs de retenção já determinam.
alter table public.vendas_registradas
  drop constraint if exists vendas_registradas_dono;

-- Negócio oculto NÃO é negócio ausente: EXISTS consulta a RLS real do pai.
-- Venda sem negócio mantém a leitura por organização que já tinha.
drop policy if exists tenant_isolation_vendas_registradas_select on public.vendas_registradas;
create policy tenant_isolation_vendas_registradas_select
  on public.vendas_registradas
  for select to authenticated using (
    (select public.fn_is_platform_admin())
    or (
      organization_id in (select public.fn_user_org_ids())
      and (
        lead_id is null
        or exists (
          select 1 from public.crm_leads l
          where l.id = vendas_registradas.lead_id
            and l.organization_id = vendas_registradas.organization_id
        )
      )
    )
  );

notify pgrst, 'reload schema';
