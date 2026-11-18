import { describe, expect, it, vi } from 'vitest';
vi.mock('./aviso-organizacao-consumidor', () => ({ processarAvisoOrganizacao: vi.fn(async () => { throw new Error('falha de envio'); }) }));
vi.mock('../db/request-pool', () => ({ getRequestPool: vi.fn(() => ({})) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
import { avisoOrganizacaoHandler } from './aviso-organizacao.handler';
import { dispatchEvent, registerHandler, type EventRow } from '@/lib/event-log/dispatcher';

describe('envio do aviso', () => {
  it('declara no contexto do servidor que o aviso não é envio de IA, para ignorar o modo de teste do canal', async () => {
    const enviar = vi.fn(async () => ({ status: 'sent' }));
    vi.resetModules();
    vi.doMock('@/app/api/v1/messages/_handler', () => ({ sendMessageHandler: enviar }));
    vi.doMock('./aviso-organizacao-consumidor', () => ({
      processarAvisoOrganizacao: vi.fn(async (_row: unknown, portas: { envia: (e: unknown) => Promise<void> }) => {
        await portas.envia({ organizationId: 'org', conversationId: 'conv', chave: 'k', body: 'fora do horário' });
        return 'enviado';
      }),
    }));
    const { avisoOrganizacaoHandler: handler } = await import('./aviso-organizacao.handler');
    const row: EventRow = { id: 'id', organization_id: 'org', event_type: 'message.received', entity_kind: 'message', entity_id: null, payload: {}, metadata: {}, consumed_by: [], attempts: 0 };
    await handler.handle(row);
    expect(enviar).toHaveBeenCalledOnce();
    const chamada = enviar.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(chamada[1]).toMatchObject({ organization_id: 'org', avisoDaOrganizacao: true });
    vi.doUnmock('@/app/api/v1/messages/_handler');
  });
});

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
