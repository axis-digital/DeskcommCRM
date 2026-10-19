/**
 * Qual funil a aba "Funis" abre.
 *
 * O padrão marcado vence, mas SÓ se estiver vivo: arquivar o funil padrão não
 * pode transformar a aba num beco (o quadro de um funil que não recebe
 * negócio). Sem padrão vivo, vale a ordem que a organização deu à lista
 * (`position`), nunca a ordem em que o banco devolveu as linhas.
 */
export interface FunilCandidato {
  id: string;
  name: string;
  position: number;
  is_default: boolean;
  is_archived: boolean;
}

export function escolherFunilPadrao<T extends FunilCandidato>(funis: readonly T[]): T | null {
  const vivos = funis.filter((f) => !f.is_archived).sort((a, b) => a.position - b.position);
  return vivos.find((f) => f.is_default) ?? vivos[0] ?? null;
}
