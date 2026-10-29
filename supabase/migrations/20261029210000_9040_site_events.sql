-- manifest: **Eventos do site na linha do tempo do contato (etapa 1).** Cria `site_events` (cadastro na loja, carrinho adicionado, checkout iniciado e carrinho abandonado; um por fato, único por organização + `dedupe_key`; leitura pela organização, escrita só pelo servidor, com `ga_client_id` e `ga_session_id` já previstos, nulos) e a função `fn_gravar_evento_do_site` (`security definer` só para `service_role`; contato de outra organização ou anonimizado não é aceito; o mesmo fato regravado atualiza o payload e nunca duplica). Privilégios explícitos por papel, porque a Supabase deixa de conceder permissão automática a tabela nova em 30/10/2026. Idempotente.

-- 9040 — eventos do site na linha do tempo do contato
--
-- Por quê: `crm_lead_activities.lead_id` é NOT NULL, então quem só se cadastrou ou
-- abandonou o carrinho (sem negócio) não tem onde gravar atividade. O pedido é
-- projetado de `orders` em tempo de leitura (sem cópia); estes eventos NÃO têm
-- tabela de origem, então precisam ser guardados — o carrinho abandonado, por
-- exemplo, some da API da Nuvemshop depois de 30 dias.
--
-- Plano: docs/superpowers/plans/2026-10-29-eventos-do-site-na-timeline-do-contato.md.
-- `contact_id` é nulo-permitido porque a etapa 2 grava também o visitante
-- anônimo (apagado após 90 dias se nunca se identificar); a etapa 1 sempre
-- resolve o contato.
--
-- `pedido` fica de fora do vocabulário de propósito: o pedido tem fonte única
-- (`orders`) e entra na linha do tempo por projeção.

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  kind text not null check (kind in (
    'cadastro', 'carrinho_adicionado', 'checkout_iniciado', 'carrinho_abandonado'
  )),
  source text not null check (char_length(source) between 1 and 40),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  occurred_at timestamptz not null,
  ga_client_id text check (ga_client_id is null or ga_client_id ~ '^[0-9]{1,12}\.[0-9]{1,12}$'),
  ga_session_id text check (ga_session_id is null or ga_session_id ~ '^[0-9]{1,20}$'),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);

-- A linha do tempo lê por contato, do mais recente para o mais antigo.
create index if not exists idx_site_events_contato_tempo
  on public.site_events (organization_id, contact_id, occurred_at desc, id desc)
  where contact_id is not null;

-- A rotina de descarte do anônimo (etapa 2) varre só o que não tem contato.
create index if not exists idx_site_events_anonimos
  on public.site_events (occurred_at)
  where contact_id is null;

alter table public.site_events enable row level security;

drop policy if exists tenant_isolation_site_events_read on public.site_events;
create policy tenant_isolation_site_events_read on public.site_events
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));

-- Privilégio explícito, do tamanho do uso: a pessoa logada só lê (e a RLS filtra
-- pela organização); o servidor lê e grava; o visitante sem login não alcança.
revoke all on table public.site_events from anon, authenticated, service_role;
grant select on table public.site_events to authenticated;
grant select, insert, update, delete on table public.site_events to service_role;

create or replace function public.fn_gravar_evento_do_site(p_organization_id uuid, p_evento jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_contato uuid := nullif(p_evento->>'contact_id', '')::uuid;
begin
  -- Contato só vale se for DESTA organização e não estiver anonimizado: a função
  -- ignora RLS, e contato anonimizado não volta a receber histórico.
  if v_contato is not null and not exists (
    select 1 from public.contacts c
     where c.id = v_contato
       and c.organization_id = p_organization_id
       and not coalesce(c.is_anonymized, false)
  ) then
    v_contato := null;
  end if;

  insert into public.site_events as e (
    organization_id, contact_id, kind, source, dedupe_key, occurred_at,
    ga_client_id, ga_session_id, payload
  ) values (
    p_organization_id,
    v_contato,
    p_evento->>'kind',
    p_evento->>'source',
    p_evento->>'dedupe_key',
    (p_evento->>'occurred_at')::timestamptz,
    nullif(p_evento->>'ga_client_id', ''),
    nullif(p_evento->>'ga_session_id', ''),
    coalesce(p_evento->'payload', '{}'::jsonb)
  )
  -- O mesmo fato regravado (webhook repetido, cron que revê o carrinho) não duplica:
  -- completa o contato que faltava e atualiza o payload. `occurred_at` fica o do
  -- primeiro registro, que é quando o fato aconteceu.
  on conflict (organization_id, dedupe_key) do update set
    contact_id = coalesce(e.contact_id, excluded.contact_id),
    payload = excluded.payload
  returning e.id into v_id;

  return v_id;
end
$$;

revoke execute on function public.fn_gravar_evento_do_site(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_gravar_evento_do_site(uuid, jsonb) to service_role;
