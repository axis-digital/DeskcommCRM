import { decidePacing, type PacingInput } from './engine';

/** O contato iniciou a conversa: apenas o aviso usa janela de resposta integral. */
export function decidePacingDoAviso(input: PacingInput): { liberado: boolean; motivo?: string } {
  const knobs = { ...input.knobs, respostaStartHour: 0, respostaEndHour: 24, allowSunday: true };
  const decisao = decidePacing({ ...input, knobs, resposta: true, prospeccao: false });
  if (!decisao.allow) return { liberado: false, motivo: decisao.code };
  return decisao.waitMs > 0 ? { liberado: false, motivo: 'throttle' } : { liberado: true };
}
