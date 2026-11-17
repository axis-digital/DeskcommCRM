import { describe, expect, it } from 'vitest';
import { chaveDoAviso, TAMANHO_MAXIMO_DO_TEXTO } from './aviso-fora-do-horario';
import { lerConfiguracaoAvisoOrganizacao, avaliarHorarioDoAviso } from './configuracao-aviso-organizacao';

const config = {
  enabled: true, timezone: 'America/New_York', notice: 'Voltaremos',
  windows: [
    { dow: 1, start: '09:00', end: '12:00' },
    { dow: 1, start: '11:00', end: '13:00' },
    { dow: 1, start: '13:00', end: '17:00' },
    { dow: 2, start: '10:00', end: '15:00' },
    { dow: 5, start: '09:00', end: '17:00' },
  ],
};
const avaliar = (iso: string) => avaliarHorarioDoAviso(config, new Date(iso));

describe('configuração do aviso da organização', () => {
  it('desliga ausência ou dados inválidos e valida texto e fuso', () => {
    expect(lerConfiguracaoAvisoOrganizacao(undefined)).toBeNull();
    expect(lerConfiguracaoAvisoOrganizacao({ ...config, timezone: 'invalido' })).toBeNull();
    expect(lerConfiguracaoAvisoOrganizacao({ ...config, notice: 'x'.repeat(TAMANHO_MAXIMO_DO_TEXTO + 1) })).toBeNull();
    expect(lerConfiguracaoAvisoOrganizacao({ ...config, windows: [{ dow: 1, start: '17:00', end: '09:00' }] })).toBeNull();
    expect(lerConfiguracaoAvisoOrganizacao(config)).toEqual(config);
  });
  it('respeita fronteiras, união de sobreposições e intervalos contíguos', () => {
    expect(avaliar('2026-03-09T12:59:59Z')?.foraDoHorario).toBe(true);
    expect(avaliar('2026-03-09T13:00:00Z')?.foraDoHorario).toBe(false);
    expect(avaliar('2026-03-09T17:30:00Z')?.foraDoHorario).toBe(false);
    expect(avaliar('2026-03-09T21:00:00Z')).toEqual({ foraDoHorario: true, inicioPeriodoFechado: new Date('2026-03-09T21:00:00Z') });
    expect(avaliar('2026-03-10T13:59:00Z')?.foraDoHorario).toBe(true);
    expect(avaliar('2026-03-10T14:00:00Z')?.foraDoHorario).toBe(false);
  });
  it('mantém o mesmo início no fim de semana e atravessa DST sem deslocar o fechamento', () => {
    const sexta = avaliar('2026-03-07T00:00:00Z');
    const domingo = avaliar('2026-03-08T18:00:00Z');
    expect(sexta?.inicioPeriodoFechado?.toISOString()).toBe('2026-03-06T22:00:00.000Z');
    expect(domingo?.inicioPeriodoFechado).toEqual(sexta?.inicioPeriodoFechado);
    expect(chaveDoAviso('contato', sexta!.inicioPeriodoFechado!)).toBe(chaveDoAviso('contato', domingo!.inicioPeriodoFechado!));
    expect(chaveDoAviso('outro', domingo!.inicioPeriodoFechado!)).not.toBe(chaveDoAviso('contato', domingo!.inicioPeriodoFechado!));
  });
  it('abre um novo período após o intervalo de almoço', () => {
    const dividido = { ...config, timezone: 'UTC', windows: [
      { dow: 1, start: '09:00', end: '12:00' },
      { dow: 1, start: '13:00', end: '17:00' },
    ] };
    const almoco = avaliarHorarioDoAviso(dividido, new Date('2026-03-09T12:30:00Z'));
    const noite = avaliarHorarioDoAviso(dividido, new Date('2026-03-09T17:30:00Z'));
    expect(almoco?.inicioPeriodoFechado?.toISOString()).toBe('2026-03-09T12:00:00.000Z');
    expect(noite?.inicioPeriodoFechado?.toISOString()).toBe('2026-03-09T17:00:00.000Z');
    expect(chaveDoAviso('contato', almoco!.inicioPeriodoFechado!)).not.toBe(chaveDoAviso('contato', noite!.inicioPeriodoFechado!));
  });
  it('identifica ambos os fechamentos quando o relógio volta no DST', () => {
    const domingo = { ...config, windows: [{ dow: 0, start: '01:00', end: '01:30' }] };
    expect(avaliarHorarioDoAviso(domingo, new Date('2026-11-01T05:45:00Z'))?.inicioPeriodoFechado?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(avaliarHorarioDoAviso(domingo, new Date('2026-11-01T06:15:00Z'))?.foraDoHorario).toBe(false);
    expect(avaliarHorarioDoAviso(domingo, new Date('2026-11-01T06:45:00Z'))?.inicioPeriodoFechado?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });
  it('não avalia quando desligado ou instante inválido', () => {
    expect(avaliarHorarioDoAviso({ ...config, enabled: false }, new Date())).toBeNull();
    expect(avaliarHorarioDoAviso(config, new Date('invalid'))).toBeNull();
  });
});
