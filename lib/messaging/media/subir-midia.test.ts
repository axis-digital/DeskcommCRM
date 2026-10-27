import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O motor de canvas não roda no jsdom; o que este arquivo prova é a FIAÇÃO:
// `subirMidia` passa a resposta pelo compressor e manda o resultado, e deixa a
// nota interna intacta. A regra da compressão é provada em
// `compressao-de-imagem.test.ts`.
const comprimir = vi.fn();
vi.mock("@/lib/messaging/media/comprimir-imagem-no-navegador", () => ({
  comprimirImagemParaEnvio: (f: File) => comprimir(f),
}));

import { subirMidia } from "./subir-midia";

const UPLOADED = {
  storage_path: "org/conv/out-x.jpg",
  media_mime: "image/jpeg",
  media_size_bytes: 10,
  kind: "image",
};

let enviado: FormData | null = null;

beforeEach(() => {
  enviado = null;
  comprimir.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      enviado = init.body as FormData;
      return new Response(JSON.stringify({ data: UPLOADED }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subirMidia: compressão no caminho do upload", () => {
  it("resposta ao cliente sobe o arquivo que o compressor devolveu", async () => {
    const original = new File([new Uint8Array(500_000)], "foto.png", { type: "image/png" });
    const reduzido = new File([new Uint8Array(1_000)], "foto.jpg", { type: "image/jpeg" });
    comprimir.mockResolvedValue(reduzido);

    await subirMidia({ conversationId: "c1", file: original });

    expect(comprimir).toHaveBeenCalledWith(original);
    const file = enviado!.get("file") as File;
    expect(file.name).toBe("foto.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBe(1_000);
  });

  it("nota interna sobe o arquivo como veio, sem passar pelo compressor", async () => {
    const original = new File([new Uint8Array(500_000)], "foto.png", { type: "image/png" });

    await subirMidia({ conversationId: "c1", file: original, destino: "nota" });

    expect(comprimir).not.toHaveBeenCalled();
    const file = enviado!.get("file") as File;
    expect(file.name).toBe("foto.png");
    expect(file.size).toBe(500_000);
  });

  it("áudio (Blob, não File) não passa pelo compressor", async () => {
    const audio = new Blob([new Uint8Array(100)], { type: "audio/webm" });

    await subirMidia({ conversationId: "c1", file: audio });

    expect(comprimir).not.toHaveBeenCalled();
    expect((enviado!.get("file") as File).name).toBe("audio");
  });
});

describe("subirMidia: nota de voz", () => {
  it("a gravação do composer leva nota_de_voz=1 e não passa pelo compressor de imagem", async () => {
    const gravacao = new Blob([new Uint8Array(2_000)], { type: "audio/webm" });

    await subirMidia({ conversationId: "c1", file: gravacao, notaDeVoz: true });

    expect(enviado!.get("nota_de_voz")).toBe("1");
    expect(comprimir).not.toHaveBeenCalled();
  });

  it("sem notaDeVoz o campo nem vai no formulário", async () => {
    const audio = new Blob([new Uint8Array(2_000)], { type: "audio/ogg" });

    await subirMidia({ conversationId: "c1", file: audio });

    expect(enviado!.has("nota_de_voz")).toBe(false);
  });
});
