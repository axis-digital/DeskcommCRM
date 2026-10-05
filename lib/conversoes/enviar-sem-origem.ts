/**
 * O opt-in do fallback offline: enviar venda de contato SEM sessão nem clique,
 * identificado pelo telefone (Meta) ou por e-mail/telefone (Google Ads).
 *
 * Ausente é desligado (mesma régua de `venda-pelo-canal.ts`). Venda orgânica no
 * otimizador de anúncio conta como se viesse de anúncio, então a decisão é do
 * administrador da organização, nunca padrão.
 */
import { createHash } from "node:crypto";

export function enviarSemOrigemLigado(settings: unknown): boolean {
  const conversions = (settings as { conversions?: { enviar_sem_origem?: unknown } } | null)
    ?.conversions;
  return conversions?.enviar_sem_origem === true;
}

/** SHA-256 do valor normalizado (trim + minúsculas), como as duas plataformas exigem. */
export function hashNormalizado(valor: string): string {
  return createHash("sha256").update(valor.trim().toLowerCase()).digest("hex");
}
