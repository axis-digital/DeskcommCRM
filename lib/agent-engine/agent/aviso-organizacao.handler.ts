import { randomUUID } from 'node:crypto';
import type { EventHandler, HandlerResult } from '@/lib/event-log/dispatcher';
import { logger } from '@/lib/logger';
import { getRequestPool } from '../db/request-pool';
import { decidePacingDoAviso } from '../pacing/aviso-imediato';
import { loadChannelKnobs, loadPacingState, recordSend } from '../pacing/store';
import { capabilitiesOf } from '@/lib/channels/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { MARCA_DO_AVISO, portasDeProducao } from './aviso-fora-do-horario';
import { lerConfiguracaoAvisoOrganizacao } from './configuracao-aviso-organizacao';
import { processarAvisoOrganizacao, type PortasAvisoOrganizacao } from './aviso-organizacao-consumidor';

export const AVISO_ORGANIZACAO_KEY = 'aviso-organizacao.v1';

function portas(): PortasAvisoOrganizacao {
  const db = getRequestPool();
  const legado = portasDeProducao(db, createAdminClient(), logger);
  return {
    ...legado,
    async carregar(row) {
      const messageId = typeof row.payload.message_id === 'string' ? row.payload.message_id : row.entity_id;
      if (!messageId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) return null;
      const { rows } = await db.query<{
        conversation_id: string; contact_id: string; channel_session_id: string;
        settings: unknown; is_personal: boolean;
      }>(`select c.id as conversation_id, c.contact_id, c.channel_session_id, o.settings, p.is_personal
          from messages m
          join conversations c on c.id = m.conversation_id and c.organization_id = m.organization_id
          join contacts p on p.id = c.contact_id and p.organization_id = c.organization_id
          join organizations o on o.id = m.organization_id
          join channel_sessions s on s.id = c.channel_session_id and s.organization_id = c.organization_id
          where m.organization_id = $1 and m.id = $2 and m.direction = 'inbound'
            and m.contact_id = c.contact_id and m.channel_session_id = c.channel_session_id
            and coalesce(c.is_group, false) = false and s.archived_at is null`,
      [row.organization_id, messageId]);
      const fato = rows[0];
      if (!fato) return null;
      const settings = typeof fato.settings === 'object' && fato.settings !== null ? fato.settings as Record<string, unknown> : {};
      const config = lerConfiguracaoAvisoOrganizacao(settings.aviso_fora_do_horario);
      if (!config?.enabled || !config.notice.trim() || fato.is_personal) return null;
      return { conversationId: fato.conversation_id, contactId: fato.contact_id, channelSessionId: fato.channel_session_id,
        config, pessoal: false };
    },
    async reservar(org, contato, periodo) {
      const token = randomUUID();
      // Poda limitada por organização ativa; o período corrente tem no máximo
      // oito dias, portanto linhas com mais de 90 dias já não deduplicam hoje.
      await db.query(`delete from reservas_aviso_organizacao where ctid in
        (select ctid from reservas_aviso_organizacao where organization_id = $1
         and criado_em < now() - interval '90 days' limit 100)`, [org]);
      const { rows } = await db.query<{ token: string }>(`insert into reservas_aviso_organizacao
        (organization_id, contact_id, inicio_periodo, token, estado, expira_em)
        values ($1, $2, $3, $4, 'reservada', now() + interval '5 minutes')
        on conflict (organization_id, contact_id, inicio_periodo) do update
        set token = excluded.token, estado = 'reservada', expira_em = excluded.expira_em
        where reservas_aviso_organizacao.estado = 'falha'
          or (reservas_aviso_organizacao.estado = 'reservada' and reservas_aviso_organizacao.expira_em < now())
        returning token`, [org, contato, periodo, token]);
      return rows[0]?.token ?? null;
    },
    async iniciarEnvio(org, contato, periodo, token) {
      const { rowCount } = await db.query(`update reservas_aviso_organizacao set estado = 'incerta'
        where organization_id = $1 and contact_id = $2 and inicio_periodo = $3 and token = $4
          and estado = 'reservada' and expira_em > now()`, [org, contato, periodo, token]);
      if (rowCount === 1) logger.info('[aviso-organizacao] envio iniciado; estado incerto até confirmação', { organization_id: org, contact_id: contato, periodo });
      return rowCount === 1;
    },
    async concluirEnvio(org, contato, periodo, token) {
      await db.query(`update reservas_aviso_organizacao set estado = 'enviada'
        where organization_id = $1 and contact_id = $2 and inicio_periodo = $3 and token = $4
          and estado = 'incerta'`, [org, contato, periodo, token]);
    },
    async envia(entrada) {
      const { sendMessageHandler } = await import('@/app/api/v1/messages/_handler');
      const mensagem = await sendMessageHandler(createAdminClient(),
        { organization_id: entrada.organizationId, actor: { type: 'webhook_source', id: 'agent-engine' }, requestId: entrada.chave },
        { conversation_id: entrada.conversationId, type: 'text', body: entrada.body,
          metadata: { idempotency_key: entrada.chave, [MARCA_DO_AVISO]: true } });
      if (!['sent', 'delivered', 'read'].includes(mensagem.status)) throw new Error('resultado_do_aviso_incerto');
    },
    pacing: {
      async decide(organizationId, channelSessionId, agora) {
        const cfg = await loadChannelKnobs(db, organizationId, channelSessionId);
        const state = await loadPacingState(db, organizationId, channelSessionId, { now: agora, timezone: cfg.knobs.timezone, numberActivatedAt: cfg.numberActivatedAt });
        const { rows } = await db.query<{ provider: string | null; daily_message_limit: number | null }>(
          'select provider, daily_message_limit from channel_sessions where organization_id = $1 and id = $2', [organizationId, channelSessionId]);
        const canal = rows[0];
        if (!canal) return { liberado: false, motivo: 'canal_inexistente' };
        const banRisk = canal.provider ? capabilitiesOf(canal.provider as never).banRisk : true;
        // Esta resposta é provocada pelo contato agora: só ela ignora a janela
        // de cortesia e o domingo; throttle e contabilização permanecem ativos.
        return decidePacingDoAviso({ now: agora, knobs: cfg.knobs, state, crmDailyLimit: canal.daily_message_limit, banRisk });
      },
      async registraEnvio(organizationId, channelSessionId, quando) {
        await recordSend(db, organizationId, channelSessionId, quando, { resposta: true });
      },
    },
  };
}

export const avisoOrganizacaoHandler: EventHandler = {
  key: AVISO_ORGANIZACAO_KEY,
  events: ['message.received'],
  naOrgParada: 'pula',
  async handle(row): Promise<HandlerResult> {
    try {
      const detail = await processarAvisoOrganizacao(row, portas(), new Date());
      return { consumer_key: AVISO_ORGANIZACAO_KEY, status: detail === 'enviado' ? 'ok' : 'skipped', detail };
    } catch (err) {
      logger.warn('[aviso-organizacao] falha no aviso ou envio incerto; não repetir automaticamente', { organization_id: row.organization_id, event_id: row.id, error: err instanceof Error ? err.message.slice(0, 200) : 'erro' });
      return { consumer_key: AVISO_ORGANIZACAO_KEY, status: 'error', detail: 'aviso_falhou' };
    }
  },
};
