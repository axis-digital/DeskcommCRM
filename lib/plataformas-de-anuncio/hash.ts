/**
 * SHA-256 de identificador de contato, normalizado como as plataformas exigem
 * (trim + minúsculas). Mora no eixo de plataformas, e não em `lib/conversoes/`,
 * porque o transporte do Google o usa e o eixo de conversões depende dele, e
 * não o contrário.
 */
import { createHash } from "node:crypto";

export function hashNormalizado(valor: string): string {
  return createHash("sha256").update(valor.trim().toLowerCase()).digest("hex");
}
