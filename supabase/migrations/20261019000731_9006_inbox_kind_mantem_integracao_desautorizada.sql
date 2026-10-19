-- manifest: **Forward-fix do vocabulário de `agent_inbox_items_kind_check`.** A 0655 (avisos de tarefa, upstream) reconstruiu a constraint sem `integracao_desautorizada` (aviso da 9005, Nuvemshop, exclusivo do fork): quem aplica migrations em ordem perderia o valor e o INSERT do aviso violaria o CHECK em silêncio. Esta passa a ser a última migration que reconstrói a constraint, com a lista inteira do baseline (já tem os dois).

-- Forward-fix: a 0655 não conhece `integracao_desautorizada` (9005, fork). Repete a
-- lista inteira do baseline, com os dois vocabulários. Idempotente: drop if exists
-- + add. Nenhuma linha existente viola — a lista só cresce em relação à 0655.

alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'proposal_expired_notice',
    'proposal_acceptance_rate_drop',
    'proposal_promised_not_created',
    'proposta_travada',
    'proposta_pronta_para_revisao',
    'org_reativada',
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    'canal_pausado',
    'cobranca',
    'email_de_login_trocado',
    'integracao_desautorizada',
    'task_due',
    'task_overdue',
    'other'
  ));
