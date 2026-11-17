/** Quando o aviso da organização está ligado, ele tem prioridade e o aviso legado do agente não envia. */
import type { EventRow } from '@/lib/event-log/dispatcher';
import { chaveDoAviso, type PortasDoAviso } from './aviso-fora-do-horario';
import { avaliarHorarioDoAviso, lerConfiguracaoAvisoOrganizacao } from './configuracao-aviso-organizacao';

export interface FatosDoAvisoOrganizacao {
  conversationId: string;
  contactId: string;
  channelSessionId: string;
  config: unknown;
  pessoal: boolean;
}
export interface PortasAvisoOrganizacao extends Pick<PortasDoAviso, 'leContato' | 'ehNumeroInterno' | 'jaAvisado' | 'pacing' | 'envia'> {
  carregar(row: EventRow, agora: Date): Promise<FatosDoAvisoOrganizacao | null>;
  reservar(org: string, contato: string, periodo: string): Promise<string | null>;
  iniciarEnvio(org: string, contato: string, periodo: string, token: string): Promise<boolean>;
  concluirEnvio(org: string, contato: string, periodo: string, token: string): Promise<void>;
}

/** A exceção de envio é tratada pelo adapter, sem afetar os demais consumidores. */
export async function processarAvisoOrganizacao(row: EventRow, deps: PortasAvisoOrganizacao, agora: Date): Promise<string> {
  const fatos = await deps.carregar(row, agora);
  if (!fatos) return 'sem_fatos';
  const config = lerConfiguracaoAvisoOrganizacao(fatos.config);
  if (!config?.enabled || !config.notice.trim()) return 'desligado';
  if (fatos.pessoal) return 'contato_pessoal';
  const horario = avaliarHorarioDoAviso(config, agora);
  if (!horario) return 'sem_periodo';
  if (!horario.foraDoHorario) return 'dentro_da_janela';
  if (!horario.inicioPeriodoFechado) return 'sem_periodo';
  const contato = await deps.leContato(row.organization_id, fatos.contactId);
  if (!contato || contato.isBlocked || contato.forceHuman || contato.isAnonymized) return 'contato_vetado';
  if (contato.phoneNumber && await deps.ehNumeroInterno(row.organization_id, contato.phoneNumber)) return 'numero_interno';
  const chave = chaveDoAviso(fatos.contactId, horario.inicioPeriodoFechado);
  if (await deps.jaAvisado(row.organization_id, fatos.contactId, chave)) return 'ja_avisado';
  const pacing = await deps.pacing.decide(row.organization_id, fatos.channelSessionId, agora);
  if (!pacing.liberado) return `pacing:${pacing.motivo ?? 'vetado'}`;
  const periodo = horario.inicioPeriodoFechado.toISOString();
  const token = await deps.reservar(row.organization_id, fatos.contactId, periodo);
  if (!token) return 'ja_reservado';
  // Após esta transição, queda ou timeout pode ter ocorrido depois do canal
  // aceitar: nunca retente automaticamente um resultado desconhecido.
  if (!await deps.iniciarEnvio(row.organization_id, fatos.contactId, periodo, token)) return 'reserva_expirada';
  await deps.envia({ organizationId: row.organization_id, conversationId: fatos.conversationId, chave, body: config.notice });
  await deps.concluirEnvio(row.organization_id, fatos.contactId, periodo, token);
  try { await deps.pacing.registraEnvio(row.organization_id, fatos.channelSessionId, agora); } catch { /* envio já ocorreu */ }
  return 'enviado';
}

