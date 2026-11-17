import { describe, expect, it, vi } from 'vitest';
vi.mock('./aviso-organizacao-consumidor', () => ({ processarAvisoOrganizacao: vi.fn(async () => { throw new Error('falha de envio'); }) }));
vi.mock('../db/request-pool', () => ({ getRequestPool: vi.fn(() => ({})) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
import { avisoOrganizacaoHandler } from './aviso-organizacao.handler';
import { dispatchEvent, registerHandler, type EventRow } from '@/lib/event-log/dispatcher';

describe('isolamento do aviso', () => {
  it('retorna erro próprio sem interromper os outros consumidores do mesmo evento', async () => {
    const anterior = vi.fn(async () => ({ consumer_key: 'teste-roteamento', status: 'ok' as const }));
    const posterior = vi.fn(async () => ({ consumer_key: 'teste-posterior', status: 'ok' as const }));
    registerHandler({ key: 'teste-roteamento', naOrgParada: 'roda', events: ['message.received'], handle: anterior });
    registerHandler(avisoOrganizacaoHandler);
    registerHandler({ key: 'teste-posterior', naOrgParada: 'roda', events: ['message.received'], handle: posterior });
    const row: EventRow = { id: 'id', organization_id: 'org', event_type: 'message.received', entity_kind: 'message', entity_id: null, payload: {}, metadata: {}, consumed_by: [], attempts: 0 };
    const result = await dispatchEvent(row, { orgParada: false, soHandlers: ['teste-roteamento', avisoOrganizacaoHandler.key, 'teste-posterior'] });
    expect(result.map(r => r.status)).toEqual(['ok', 'error', 'ok']);
    expect(anterior).toHaveBeenCalledOnce();
    expect(posterior).toHaveBeenCalledOnce();
  });
});
