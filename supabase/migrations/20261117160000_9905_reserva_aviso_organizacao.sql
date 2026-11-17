-- manifest: Reserva por contato e período impede dois avisos simultâneos sem perder o estado de envio incerto.
create table if not exists public.reservas_aviso_organizacao (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  inicio_periodo timestamptz not null,
  token uuid not null,
  estado text not null check (estado in ('reservada', 'enviada', 'falha', 'incerta')),
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  primary key (organization_id, contact_id, inicio_periodo)
);
create index if not exists reservas_aviso_organizacao_poda_idx on public.reservas_aviso_organizacao (organization_id, criado_em);
alter table public.reservas_aviso_organizacao enable row level security;
drop policy if exists tenant_isolation_reservas_aviso_organizacao_all on public.reservas_aviso_organizacao;
create policy tenant_isolation_reservas_aviso_organizacao_all on public.reservas_aviso_organizacao
  for all to authenticated using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
revoke all on public.reservas_aviso_organizacao from public, anon, authenticated;
grant select on public.reservas_aviso_organizacao to authenticated;
grant all on public.reservas_aviso_organizacao to service_role;
