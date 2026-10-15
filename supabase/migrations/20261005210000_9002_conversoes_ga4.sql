-- manifest: GA4 como destino de conversões — plataforma 'ga4' na conexão, evento de venda escolhido, regras por etapa (ga4_conversion_rules) e retrato do evento no livro-razão
--
-- O GA4 é DESTINO de análise, não origem de atribuição: reaproveita a tabela
-- agnóstica de credencial (dataset_id = Measurement ID; access_token_encrypted =
-- API secret) e o livro-razão, e ganha regras por etapa espelhadas da 0524.

alter table public.ad_platform_connections
  drop constraint if exists ad_platform_connections_platform_conhecida;
alter table public.ad_platform_connections
  add constraint ad_platform_connections_platform_conhecida
  check (platform = any (array['meta_ads'::text, 'google_ads'::text, 'ga4'::text]));

alter table public.ad_platform_connections
  add column if not exists ga4_won_event text;
alter table public.ad_platform_connections
  drop constraint if exists ad_platform_connections_ga4_won_event_check;
alter table public.ad_platform_connections
  add constraint ad_platform_connections_ga4_won_event_check
  check (ga4_won_event is null or ga4_won_event in ('close_convert_lead', 'purchase'));

comment on column public.ad_platform_connections.ga4_won_event is
  'Só para platform=ga4: o evento que o ganho envia. close_convert_lead (funil de leads, padrão) ou purchase (e-commerce, com transaction_id = id do lead).';

create table if not exists public.ga4_conversion_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stage_id uuid not null,
  event_name text not null,
  ga4_event text not null,
  enabled boolean not null default true,
  configured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint ga4_conversion_rules_evento_do_livro
    check (event_name ~ '^GA4Etapa:[0-9a-f-]{36}$'),
  constraint ga4_conversion_rules_evento_conhecido
    check (ga4_event in ('generate_lead', 'qualify_lead', 'working_lead', 'begin_checkout'))
);

alter table public.ga4_conversion_rules
  drop constraint if exists ga4_conversion_rules_stage_org_fk;
alter table public.ga4_conversion_rules
  add constraint ga4_conversion_rules_stage_org_fk
  foreign key (organization_id, stage_id)
  references public.crm_stages (organization_id, id)
  on delete cascade;

create unique index if not exists ga4_conversion_rules_org_stage_uk
  on public.ga4_conversion_rules (organization_id, stage_id);
create unique index if not exists ga4_conversion_rules_org_event_uk
  on public.ga4_conversion_rules (organization_id, event_name);

comment on table public.ga4_conversion_rules is
  'Qual evento recomendado do GA4 cada etapa do funil envia quando um negócio entra nela. event_name (GA4Etapa:<uuid>) é a chave do livro-razão ad_conversion_dispatches. Server-side only: RLS sem policy e grants revogados de anon/authenticated.';

alter table public.ga4_conversion_rules enable row level security;
revoke all on public.ga4_conversion_rules from anon, authenticated;
grant select, insert, update, delete on public.ga4_conversion_rules to service_role;

drop trigger if exists trg_ga4_conversion_rules_updated_at on public.ga4_conversion_rules;
create trigger trg_ga4_conversion_rules_updated_at
  before update on public.ga4_conversion_rules
  for each row execute function public.fn_set_updated_at();

create or replace function public.fn_marcar_configuracao_regra_ga4()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.configured_at := coalesce(new.configured_at, now());
  elsif new.stage_id is distinct from old.stage_id
     or new.ga4_event is distinct from old.ga4_event
     or (new.enabled and not old.enabled) then
    new.configured_at := now();
  else
    new.configured_at := old.configured_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_marcar_configuracao_regra_ga4() from public, anon, authenticated;
grant execute on function public.fn_marcar_configuracao_regra_ga4() to service_role;

drop trigger if exists trg_marcar_configuracao_regra_ga4 on public.ga4_conversion_rules;
create trigger trg_marcar_configuracao_regra_ga4
  before insert or update on public.ga4_conversion_rules
  for each row execute function public.fn_marcar_configuracao_regra_ga4();

alter table public.ad_conversion_dispatches
  add column if not exists ga4_event_name text;
comment on column public.ad_conversion_dispatches.ga4_event_name is
  'Retrato do evento GA4 (9002): o nome que saiu no fio. Reenviar usa este, nunca a regra de agora.';

notify pgrst, 'reload schema';
