/**
 * A REGRA da compressão de imagem antes do upload da Inbox — sem canvas.
 *
 * Medido em produção em 2026-10-14: um PNG de 1,7 MB levava 4,6s só no
 * envio de imagem do canal (que baixa, decodifica, gera a miniatura e sobe ao CDN do
 * WhatsApp), contra 2,2s de um documento de 8 MB, que vai sem processamento. O
 * WhatsApp recomprime a imagem de qualquer jeito, então mandar o original não
 * preserva qualidade nenhuma para quem recebe — só custa tempo a quem atende.
 *
 * O motor que mexe nos pixels mora em `comprimir-imagem-no-navegador.ts`; aqui
 * fica só o que se decide, porque a suíte não tem canvas (jsdom) e a decisão é
 * o que precisa de teste.
 */

/** Lado maior da imagem enviada. Acima disso o WhatsApp reduz mesmo assim. */
export const LADO_MAXIMO = 1600;

/** Qualidade do JPEG reencodado (0..1): sem artefato visível em foto ou print. */
export const QUALIDADE_DO_JPEG = 0.82;

/** Abaixo disto o ganho não paga a reencodagem. */
export const LIMIAR_DE_BYTES = 300_000;

/** O comprimido só vence se economizar pelo menos esta fração do original. */
const ECONOMIA_MINIMA = 0.1;

/**
 * GIF fica de fora porque o canvas congela a animação no primeiro quadro; SVG
 * porque é vetor. O resto (HEIC inclusive) não entra por não decodificar em
 * todo navegador — e falha de decodificação já devolve o original, mas não há
 * por que tentar o que se sabe que falha.
 */
const TIPOS_COMPRIMIVEIS = new Set(["image/png", "image/jpeg", "image/webp"]);

export function deveTentarComprimir(tipo: string, bytes: number): boolean {
  return TIPOS_COMPRIMIVEIS.has(tipo) && bytes > LIMIAR_DE_BYTES;
}

export interface Dimensoes {
  readonly largura: number;
  readonly altura: number;
}

/** Cabe o lado maior em `LADO_MAXIMO`, mantém a proporção e nunca amplia. */
export function dimensoesAlvo(largura: number, altura: number): Dimensoes {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/** Reencodar pode CRESCER o arquivo (JPEG já otimizado); aí o original vence. */
export function valeOComprimido(bytesOriginal: number, bytesComprimido: number): boolean {
  return bytesComprimido <= bytesOriginal * (1 - ECONOMIA_MINIMA);
}

/** O nome que o atendente escolheu, com a extensão do formato que de fato vai. */
export function nomeEmJpeg(nome: string): string {
  const semExtensao = nome.replace(/\.[^./\\]+$/, "");
  return `${semExtensao}.jpg`;
}
