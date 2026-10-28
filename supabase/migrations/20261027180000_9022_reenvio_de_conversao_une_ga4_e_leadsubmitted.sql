-- manifest: o reenvio de conversão volta a aceitar GA4:Venda, GA4Etapa e SemOrigem junto de LeadSubmitted — a 0805 da upstream reescreveu fn_solicitar_reenvio_conversao sem os eventos da 9003
--
-- Forward-fix da merge da upstream 2026-10-27. A 0805 redefiniu a função só com
-- `Purchase`, `QualifiedLead`, `LeadSubmitted`, `Etapa:*` e `MetaEtapa:*`, e o
-- reenvio dos eventos que a 9002/9003 gravam no livro-razão voltou a devolver
-- `false` (motivo `permanente`). Esta versão é a UNIÃO das duas: nada sai de
-- nenhum dos lados. Idempotente (`create or replace`).

create or replace function public.fn_solicitar_reenvio_conversao(p_org uuid, p_lead uuid, p_event text)
returns boolean language plpgsql set search_path = public as $$
declare v_linha public.ad_conversion_dispatches%rowtype;
begin
  if p_event is null or not (
    p_event in ('Purchase', 'QualifiedLead', 'LeadSubmitted', 'GA4:Venda')
    or p_event ~ '^Etapa:[0-9a-f-]{36}$'
    or p_event ~ '^MetaEtapa:[0-9a-f-]{36}$'
    or p_event ~ '^GA4Etapa:[0-9a-f-]{36}$'
    or p_event ~ '^SemOrigem:(meta_ads|google_ads):Purchase$'
  ) then
    return false;
  end if;
  select * into v_linha from public.ad_conversion_dispatches
    where organization_id = p_org and lead_id = p_lead and event_name = p_event for update;
  if not found or v_linha.status = 'sent' then return false; end if;
  if p_event = 'GA4:Venda' or p_event ~ '^GA4Etapa:' then
    -- O consumidor do GA4 reenvia o RETRATO: quando e qual evento saiu no fio.
    if v_linha.event_occurred_at is null or v_linha.ga4_event_name is null then return false; end if;
  elsif p_event = 'LeadSubmitted' then
    -- O nascimento por anúncio só reenvia o que o ledger da Meta reconhece (0805).
    if v_linha.platform <> 'meta_ads' or v_linha.event_occurred_at is null
       or v_linha.event_id is distinct from p_lead::text || ':LeadSubmitted'
       or v_linha.meta_event_name is distinct from 'LeadSubmitted'
       or (v_linha.claim_token is not null and v_linha.claimed_until > now())
       then return false; end if;
  elsif p_event ~ '^SemOrigem:' then
    -- A venda sem origem só sai de negócio ganho, como o `Purchase` sem protocolo.
    if not exists (
      select 1 from public.crm_leads where id = p_lead and organization_id = p_org and status = 'won'
    ) then return false; end if;
  elsif p_event ~ '^MetaEtapa:' then
    if v_linha.event_occurred_at is null or v_linha.meta_event_name is null then return false; end if;
  elsif p_event <> 'Purchase' and (v_linha.event_occurred_at is null or v_linha.google_action_id is null) then
    return false;
  end if;
  if p_event = 'Purchase' and v_linha.remote_request_id is null and not exists (
    select 1 from public.crm_leads where id = p_lead and organization_id = p_org and status = 'won'
  ) then return false; end if;
  if exists (select 1 from public.event_log where organization_id = p_org and entity_id = p_lead
    and event_type = 'ad_conversion.retry_requested' and status in ('pending', 'processing')
    and coalesce(payload->>'event_name', 'Purchase') = p_event) then return false; end if;
  perform public.emit_event('ad_conversion.retry_requested', 'crm_lead', p_lead,
    jsonb_build_object('event_name', p_event), '{}'::jsonb, p_org);
  update public.ad_conversion_dispatches set reason = 'reprocessamento_solicitado', attempted_at = now()
    where id = v_linha.id and organization_id = p_org;
  return true;
end;
$$;

revoke execute on function public.fn_solicitar_reenvio_conversao(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_solicitar_reenvio_conversao(uuid, uuid, text) to service_role;
