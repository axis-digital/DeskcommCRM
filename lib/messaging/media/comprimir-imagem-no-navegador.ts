/**
 * O MOTOR da compressão — o canvas de verdade. A regra está em
 * `compressao-de-imagem.ts`.
 *
 * Esta função NUNCA impede um envio: qualquer falha (sem `createImageBitmap`,
 * sem contexto 2d, `toBlob` nulo, formato que o navegador não decodifica)
 * devolve o arquivo ORIGINAL, e o upload segue como sempre seguiu. Comprimir é
 * otimização, não condição.
 */

import {
  QUALIDADE_DO_JPEG,
  deveTentarComprimir,
  dimensoesAlvo,
  nomeEmJpeg,
  valeOComprimido,
} from "./compressao-de-imagem";

async function reencodar(arquivo: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(arquivo);
  try {
    const { largura, altura } = dimensoesAlvo(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG não tem alfa: sem o fundo branco, a transparência de um PNG
    // (print de tela recortado, logo) viraria preto.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALIDADE_DO_JPEG),
    );
  } finally {
    bitmap.close();
  }
}

export async function comprimirImagemParaEnvio(arquivo: File): Promise<File> {
  if (!deveTentarComprimir(arquivo.type, arquivo.size)) return arquivo;
  try {
    const blob = await reencodar(arquivo);
    if (!blob || !valeOComprimido(arquivo.size, blob.size)) return arquivo;
    return new File([blob], nomeEmJpeg(arquivo.name), {
      type: "image/jpeg",
      lastModified: arquivo.lastModified,
    });
  } catch {
    return arquivo;
  }
}
