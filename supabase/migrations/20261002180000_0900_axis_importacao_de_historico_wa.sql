-- 0900 (fork Axis) — importação do HISTÓRICO do WhatsApp sem acordar ninguém.
--
-- Ao parear um número com o sync completo ligado no WAHA, o celular entrega até
-- N dias de conversas antigas ao WAHA. Trazer isso para o CRM pelo caminho do
-- webhook seria desastre: cada mensagem antiga INSERIDA em `messages` dispara
-- `message.received` (agente, sentimento, automações), abre demanda e reabre a
-- conversa — o agente responderia hoje a um "oi" de oito meses atrás.
--
-- O desenho:
--   1. `fn_importar_historico_wa` grava um LOTE numa transação e liga, só nela,
--      `deskcomm.importacao_historico = on` (set_config local).
--   2. Os três gatilhos de INSERT em `messages` que produzem EFEITO DE NEGÓCIO
--      ganham `WHEN` que os desliga quando a marca está ligada. Fora da
--      importação a condição é sempre verdadeira — nada muda para o webhook.
--      `trg_message_service_lock` fica como está: é só uma trava, sem efeito.
--   3. Conversa NOVA nasce `closed`: o gatilho de roteamento só age em
--      `open`/`pending`, então ninguém entra na fila por causa do passado. A
--      primeira mensagem REAL do cliente reabre pelo caminho normal
--      (`fn_service_inbound`).
--   4. Idempotente por `(organization_id, external_id)` (consulta + 23505).
--      Rodar de novo, ou o webhook já ter gravado a mesma mensagem, não duplica.
--   5. A conversa ganha `last_message_*`/`last_inbound_at`/`last_outbound_at`
--      só se a mensagem importada for MAIS NOVA; `unread`/`awaiting_since` não
--      são tocados (histórico não é mensagem por responder).
--
-- Fork Axis: número 0900 para não colidir com a sequência do upstream.

drop trigger if exists trg_messages_emit_event on public.messages;
create trigger trg_messages_emit_event
  after insert on public.messages
  for each row
  when (current_setting('deskcomm.importacao_historico', true) is distinct from 'on')
  execute function public.fn_emit_message_event();

drop trigger if exists trg_demanda_abre_no_inbound on public.messages;
create trigger trg_demanda_abre_no_inbound
  after insert on public.messages
  for each row
  when (current_setting('deskcomm.importacao_historico', true) is distinct from 'on')
  execute function public.fn_demanda_abre_no_inbound();

drop trigger if exists trg_reply_inbound_revision on public.messages;
create trigger trg_reply_inbound_revision
  after insert on public.messages
  for each row
  when (current_setting('deskcomm.importacao_historico', true) is distinct from 'on')
  execute function public.fn_reply_inbound_revision();

create or replace function public.fn_importar_historico_wa(
  p_org uuid,
  p_session uuid,
  p_mensagens jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  v_contact uuid;
  v_conv uuid;
  v_inseridas int := 0;
  v_duplicadas int := 0;
  v_ignoradas int := 0;
begin
  if not exists (
    select 1 from public.channel_sessions where id = p_session and organization_id = p_org
  ) then
    raise exception 'historico_sessao_fora_da_org' using errcode = '23503';
  end if;
  if jsonb_typeof(p_mensagens) is distinct from 'array' then
    raise exception 'historico_lote_invalido' using errcode = '22023';
  end if;

  perform set_config('deskcomm.importacao_historico', 'on', true);
  -- O unique de external_id é INITIALLY DEFERRED: sem isto o 23505 só estouraria
  -- no COMMIT e derrubaria o lote inteiro em vez de contar uma duplicada.
  set constraints public.messages_org_external_id_unique immediate;

  for m in
    select * from jsonb_to_recordset(p_mensagens) as x(
      chat_id text, kind text, phone text, lid text, notify text,
      external_id text, direction text, type text, body text, media_mime text,
      sent_at timestamptz, ack int, raw_type text, preview text
    )
  loop
    if m.external_id is null or m.sent_at is null
       or m.direction not in ('inbound', 'outbound')
       or m.kind not in ('phone', 'lid') then
      v_ignoradas := v_ignoradas + 1;
      continue;
    end if;

    v_contact := public.fn_upsert_wa_contact(p_org, m.kind, m.phone, m.lid, m.chat_id, m.notify);
    if v_contact is null then
      v_ignoradas := v_ignoradas + 1;
      continue;
    end if;

    select id into v_conv from public.conversations
     where organization_id = p_org and contact_id = v_contact
       and channel_session_id = p_session and is_group = false;
    if v_conv is null then
      insert into public.conversations
        (organization_id, contact_id, channel_session_id, channel, status, is_group,
         unread_count_for_assignee, metadata)
      values (p_org, v_contact, p_session, 'whatsapp', 'closed', false, 0,
              jsonb_build_object('importada_do_historico', true))
      on conflict (organization_id, contact_id, channel_session_id) where is_group = false
      do update set updated_at = public.conversations.updated_at
      returning id into v_conv;
    end if;

    -- `messages_org_external_id_unique` é DEFERRABLE, e `on conflict` não aceita
    -- constraint adiável como árbitro: a dedup é a consulta + a captura do 23505
    -- (corrida com o webhook gravando a mesma mensagem no mesmo instante).
    if exists (
      select 1 from public.messages where organization_id = p_org and external_id = m.external_id
    ) then
      v_duplicadas := v_duplicadas + 1;
      continue;
    end if;
    begin
      insert into public.messages
        (organization_id, conversation_id, channel_session_id, contact_id, external_id,
         type, direction, status, ack, body, media_mime, sent_via, sent_at, delivered_at,
         metadata)
      values
        (p_org, v_conv, p_session, v_contact, m.external_id,
         coalesce(m.type, 'text'), m.direction,
         case when m.direction = 'inbound' then 'delivered' else 'sent' end,
         m.ack, m.body, m.media_mime, 'external_device', m.sent_at,
         case when m.direction = 'inbound' then m.sent_at end,
         jsonb_build_object('raw_type', m.raw_type, 'importada_do_historico', true,
                            'fromMe', m.direction = 'outbound'));
    exception when unique_violation then
      v_duplicadas := v_duplicadas + 1;
      continue;
    end;
    v_inseridas := v_inseridas + 1;

    update public.conversations set
      last_message_preview = case
        when last_message_at is null or m.sent_at >= last_message_at then m.preview
        else last_message_preview end,
      last_message_at = greatest(last_message_at, m.sent_at),
      last_inbound_at = case when m.direction = 'inbound'
        then greatest(last_inbound_at, m.sent_at) else last_inbound_at end,
      last_outbound_at = case when m.direction = 'outbound'
        then greatest(last_outbound_at, m.sent_at) else last_outbound_at end
    where id = v_conv and organization_id = p_org;

    update public.contacts set last_activity_at = greatest(last_activity_at, m.sent_at)
     where id = v_contact and organization_id = p_org;
  end loop;

  return jsonb_build_object(
    'inseridas', v_inseridas, 'duplicadas', v_duplicadas, 'ignoradas', v_ignoradas);
end;
$$;

revoke all on function public.fn_importar_historico_wa(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_importar_historico_wa(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
