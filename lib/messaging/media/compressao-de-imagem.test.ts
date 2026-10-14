import { describe, expect, it } from "vitest";

import {
  LADO_MAXIMO,
  LIMIAR_DE_BYTES,
  deveTentarComprimir,
  dimensoesAlvo,
  nomeEmJpeg,
  valeOComprimido,
} from "./compressao-de-imagem";

describe("deveTentarComprimir", () => {
  it("PNG grande entra — é o caso medido: 1,7 MB, 4,6s no canal", () => {
    expect(deveTentarComprimir("image/png", 1_754_514)).toBe(true);
  });

  it("JPEG e WebP grandes entram", () => {
    expect(deveTentarComprimir("image/jpeg", LIMIAR_DE_BYTES + 1)).toBe(true);
    expect(deveTentarComprimir("image/webp", LIMIAR_DE_BYTES + 1)).toBe(true);
  });

  it("imagem pequena passa intacta: reencodar não compensa", () => {
    expect(deveTentarComprimir("image/png", LIMIAR_DE_BYTES)).toBe(false);
  });

  it("GIF fica de fora: o canvas congela a animação no primeiro quadro", () => {
    expect(deveTentarComprimir("image/gif", 5_000_000)).toBe(false);
  });

  it("SVG e documento ficam de fora", () => {
    expect(deveTentarComprimir("image/svg+xml", 5_000_000)).toBe(false);
    expect(deveTentarComprimir("application/pdf", 5_000_000)).toBe(false);
  });
});

describe("dimensoesAlvo", () => {
  it("reduz o lado maior ao teto, mantendo a proporção", () => {
    expect(dimensoesAlvo(4000, 3000)).toEqual({ largura: LADO_MAXIMO, altura: 1200 });
    expect(dimensoesAlvo(1080, 2400)).toEqual({ largura: 720, altura: LADO_MAXIMO });
  });

  it("nunca amplia imagem que já cabe", () => {
    expect(dimensoesAlvo(800, 600)).toEqual({ largura: 800, altura: 600 });
  });

  it("nunca devolve lado zero", () => {
    expect(dimensoesAlvo(10_000, 1)).toEqual({ largura: LADO_MAXIMO, altura: 1 });
  });
});

describe("valeOComprimido", () => {
  it("usa o comprimido quando ele economiza de verdade", () => {
    expect(valeOComprimido(1_754_514, 220_000)).toBe(true);
  });

  it("fica com o original quando o ganho é marginal ou negativo", () => {
    expect(valeOComprimido(1_000_000, 950_000)).toBe(false);
    expect(valeOComprimido(400_000, 600_000)).toBe(false);
  });
});

describe("nomeEmJpeg", () => {
  it("troca a extensão para .jpg", () => {
    expect(nomeEmJpeg("print da tela.png")).toBe("print da tela.jpg");
    expect(nomeEmJpeg("foto.WEBP")).toBe("foto.jpg");
  });

  it("acrescenta .jpg quando não há extensão", () => {
    expect(nomeEmJpeg("imagem")).toBe("imagem.jpg");
  });
});

describe("comprimirImagemParaEnvio — sem canvas, o original segue", () => {
  it("ambiente sem createImageBitmap (jsdom) devolve o MESMO arquivo, sem lançar", async () => {
    const { comprimirImagemParaEnvio } = await import("./comprimir-imagem-no-navegador");
    const original = new File([new Uint8Array(LIMIAR_DE_BYTES + 10)], "print.png", {
      type: "image/png",
    });
    expect(await comprimirImagemParaEnvio(original)).toBe(original);
  });

  it("tipo fora da lista nem tenta", async () => {
    const { comprimirImagemParaEnvio } = await import("./comprimir-imagem-no-navegador");
    const pdf = new File([new Uint8Array(5_000_000)], "contrato.pdf", { type: "application/pdf" });
    expect(await comprimirImagemParaEnvio(pdf)).toBe(pdf);
  });
});
