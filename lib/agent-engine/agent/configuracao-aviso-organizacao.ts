import { z } from 'zod';
import { periodoFechadoSemanal } from './janela-de-atendimento';

/**
 * Teto do texto configurado: jsonb é livre, balão de 40KB não é.
 *
 * Mora AQUI, e não em `aviso-fora-do-horario.ts`, porque este módulo é puro
 * (só Zod e a regra de janela) e é o que o formulário da tela importa. O teto é
 * a mesma regra nos dois lados: o `maxLength` do campo e o `max` do schema.
 * `aviso-fora-do-horario.ts` reexporta daqui — a fonte é uma só.
 */
export const TAMANHO_MAXIMO_DO_TEXTO = 1000;

const hora = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const intervalo = z.object({ dow: z.number().int().min(0).max(6), start: hora, end: hora })
  .refine((v) => v.end > v.start, { message: 'O fim deve ser posterior ao início', path: ['end'] });
const fuso = z.string().min(1).refine((v) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return true; } catch { return false; }
}, 'Fuso horário inválido');

/** Valor da chave organizations.settings.aviso_fora_do_horario. */
export const configuracaoAvisoOrganizacaoSchema = z.object({
  enabled: z.boolean().default(false),
  timezone: fuso,
  windows: z.array(intervalo).min(1),
  notice: z.string().max(TAMANHO_MAXIMO_DO_TEXTO),
});
export type ConfiguracaoAvisoOrganizacao = z.output<typeof configuracaoAvisoOrganizacaoSchema>;

/** JSONB ausente ou inválido não ativa o aviso. */
export function lerConfiguracaoAvisoOrganizacao(valor: unknown): ConfiguracaoAvisoOrganizacao | null {
  const resultado = configuracaoAvisoOrganizacaoSchema.safeParse(valor);
  return resultado.success ? resultado.data : null;
}

/** Resultado nulo indica configuração desligada ou indeterminável. */
export function avaliarHorarioDoAviso(config: ConfiguracaoAvisoOrganizacao, agora: Date):
  { foraDoHorario: boolean; inicioPeriodoFechado: Date | null } | null {
  const valida = lerConfiguracaoAvisoOrganizacao(config);
  if (!valida?.enabled) return null;
  return periodoFechadoSemanal(valida.timezone, valida.windows, agora);
}
