import { describe, it, expect, vi } from 'vitest';
import { processarAvisoOrganizacao, type PortasAvisoOrganizacao } from './aviso-organizacao-consumidor';

import { decidePacingDoAviso } from '../pacing/aviso-imediato';
import { PACING_DEFAULTS } from '../pacing/defaults';

const config = { enabled: true, timezone: 'UTC', notice: 'Fechado', windows: [1,2,3,4,5].map(dow => ({ dow, start: '09:00', end: '17:00' })) };
function portas() {
  const enviadas = new Set<string>();
  const reservas = new Set<string>();
  const deps: PortasAvisoOrganizacao = {
    carregar: vi.fn(async () => ({ conversationId: 'conversa', contactId: 'contato', channelSessionId: 'canal', config, pessoal: false })),
    leContato: vi.fn(async () => ({ isBlocked: false, forceHuman: false, isAnonymized: false, phoneNumber: '123' })),
    ehNumeroInterno: vi.fn(async () => false),
    jaAvisado: vi.fn(async (_org, _contato, chave) => enviadas.has(chave)),
    reservar: vi.fn(async (_org, _contato, chave) => { if (reservas.has(chave)) return null; reservas.add(chave); return 'token'; }),
    iniciarEnvio: vi.fn(async () => true),
    concluirEnvio: vi.fn(async () => {}),
    pacing: { decide: vi.fn(async () => ({ liberado: true })), registraEnvio: vi.fn(async () => {}) },
    envia: vi.fn(async ({ chave }) => { enviadas.add(chave); }),
  };
  return deps;
}
const row = { id: 'evento', organization_id: 'org', event_type: 'message.received', entity_kind: 'message', entity_id: 'mensagem', payload: {}, metadata: {}, consumed_by: [], attempts: 0 };
describe('aviso de organização', () => {
  it.each(['2026-03-09T23:00:00Z', '2026-03-07T14:00:00Z', '2026-03-08T14:00:00Z'])('envia fora da janela em %s', async (iso) => {
    const deps = portas();
    expect(await processarAvisoOrganizacao(row, deps, new Date(iso))).toBe('enviado');
    expect(deps.envia).toHaveBeenCalledOnce();
    expect(deps.pacing.registraEnvio).toHaveBeenCalledOnce();
  });
  it('não envia dentro da janela e não repete no mesmo período entre conversas', async () => {
    const deps = portas();
    expect(await processarAvisoOrganizacao(row, deps, new Date('2026-03-09T10:00:00Z'))).toBe('dentro_da_janela');
    expect(await processarAvisoOrganizacao(row, deps, new Date('2026-03-09T23:00:00Z'))).toBe('enviado');
    expect(await processarAvisoOrganizacao({ ...row, entity_id: 'outra' }, deps, new Date('2026-03-09T23:01:00Z'))).toBe('ja_avisado');
    expect(await processarAvisoOrganizacao(row, deps, new Date('2026-03-10T23:00:00Z'))).toBe('enviado');
  });
  it.each(['isBlocked', 'forceHuman', 'isAnonymized'] as const)('veta %s', async (campo) => {
    const deps = portas();
    vi.mocked(deps.leContato).mockResolvedValue({ isBlocked: false, forceHuman: false, isAnonymized: false, phoneNumber: '123', [campo]: true });
    expect(await processarAvisoOrganizacao(row, deps, new Date('2026-03-09T23:00:00Z'))).toBe('contato_vetado');
    expect(deps.envia).not.toHaveBeenCalled();
  });
  it('veta número interno', async () => {
    const deps = portas(); vi.mocked(deps.ehNumeroInterno).mockResolvedValue(true);
    expect(await processarAvisoOrganizacao(row, deps, new Date('2026-03-09T23:00:00Z'))).toBe('numero_interno');
  });
  it('respeita contato pessoal', async () => {
    const deps = portas();
    vi.mocked(deps.carregar).mockResolvedValue({ conversationId: 'conversa', contactId: 'contato', channelSessionId: 'canal', config, pessoal: true });
    await processarAvisoOrganizacao(row, deps, new Date('2026-03-09T23:00:00Z'));
    expect(deps.envia).not.toHaveBeenCalled();
  });
  it('reserva antes de enviar em chamadas concorrentes', async () => {
    const deps = portas();
    vi.mocked(deps.jaAvisado).mockResolvedValue(false);
    await Promise.all([
      processarAvisoOrganizacao(row, deps, new Date('2026-03-09T23:00:00Z')),
      processarAvisoOrganizacao({ ...row, entity_id: 'outra' }, deps, new Date('2026-03-09T23:00:00Z')),
    ]);
    expect(deps.envia).toHaveBeenCalledTimes(1);
  });
  it('abre apenas a cortesia deste aviso às 23h e domingo sem ignorar throttle', () => {
    const input = { now: new Date('2026-03-09T02:00:00Z'), knobs: { ...PACING_DEFAULTS, allowSunday: false }, state: { lastSentAt: null, sentToday: 10000, numberActivatedAt: null }, crmDailyLimit: 0, banRisk: true, rng: () => 0 };
    expect(decidePacingDoAviso(input)).toEqual({ liberado: true });
    expect(decidePacingDoAviso({ ...input, state: { ...input.state, lastSentAt: input.now } })).toEqual({ liberado: false, motivo: 'throttle' });
  });
  it('isola falha do envio', async () => {
    const deps = portas(); vi.mocked(deps.envia).mockRejectedValue(new Error('falha'));
    await expect(processarAvisoOrganizacao(row, deps, new Date('2026-03-09T23:00:00Z'))).rejects.toThrow('falha');
    expect(deps.pacing.registraEnvio).not.toHaveBeenCalled();
    expect(deps.iniciarEnvio).toHaveBeenCalledOnce();
    expect(deps.concluirEnvio).not.toHaveBeenCalled();
    expect(await processarAvisoOrganizacao(row, deps, new Date('2026-03-09T23:01:00Z'))).toBe('ja_reservado');
    expect(deps.envia).toHaveBeenCalledOnce();
  });
});
