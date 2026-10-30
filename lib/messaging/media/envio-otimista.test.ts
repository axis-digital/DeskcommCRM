/**
 * A fila de envios de mídia que ainda não viraram linha em `messages`.
 *
 * O que estes casos guardam é o contrato da bolha otimista: o arquivo e a
 * legenda nunca se perdem numa falha, a retentativa não sobe o arquivo de novo
 * quando ele já subiu, e a MESMA chave de idempotência acompanha o envio até o
 * fim — é ela que impede a retentativa de mandar a mensagem duas vezes quando a
 * primeira chamada chegou ao servidor e só a resposta se perdeu.
 */
import { describe, expect, it, vi } from "vitest";

import type { Message } from "@/lib/types/messaging";

import {
  criarFilaDeEnvios,
  criarSerieDeEnvios,
  executarEnvio,
  idsDeEnviosGravados,
  novoEnvio,
  type DepsDoEnvio,
} from "./envio-otimista";

const SUBIDO = {
  storage_path: "org/conv-1/a.jpg",
  media_mime: "image/jpeg",
  media_size_bytes: 3,
  kind: "image" as const,
};

function arquivo(nome = "foto.jpg", tipo = "image/jpeg") {
  return new File([new Uint8Array([1, 2, 3])], nome, { type: tipo });
}

function deps(over: Partial<DepsDoEnvio> = {}): DepsDoEnvio {
  return {
    subir: vi.fn(async () => SUBIDO),
    enviar: vi.fn(async () => ({ id: "msg-1" }) as Message),
    ...over,
  };
}

describe("novoEnvio", () => {
  it("nasce enviando, com o tipo tirado do mime e a legenda aparada", () => {
    const e = novoEnvio({
      id: "k-1",
      conversationId: "conv-1",
      arquivo: arquivo(),
      legenda: "  oi  ",
      previa: null,
      agora: "2026-10-14T12:00:00.000Z",
    });
    expect(e).toMatchObject({
      id: "k-1",
      fase: "enviando",
      tipo: "image",
      legenda: "oi",
      subido: null,
      erro: null,
    });
  });

  it("mime fora da lista do upload cai em documento — o card que sempre baixa", () => {
    const e = novoEnvio({
      id: "k",
      conversationId: "c",
      arquivo: arquivo("x.bin", "application/octet-stream"),
      legenda: "",
      previa: null,
      agora: "",
    });
    expect(e.tipo).toBe("document");
  });
});

describe("criarFilaDeEnvios", () => {
  it("cada conversa só vê os próprios envios", () => {
    const fila = criarFilaDeEnvios();
    fila.adicionar(
      novoEnvio({
        id: "a",
        conversationId: "conv-1",
        arquivo: arquivo(),
        legenda: "",
        previa: null,
        agora: "",
      }),
    );
    fila.adicionar(
      novoEnvio({
        id: "b",
        conversationId: "conv-2",
        arquivo: arquivo(),
        legenda: "",
        previa: null,
        agora: "",
      }),
    );
    expect(fila.daConversa(fila.todos(), "conv-1").map((e) => e.id)).toEqual(["a"]);
  });

  it("atualizar não muda o objeto anterior e troca a referência da lista", () => {
    const fila = criarFilaDeEnvios();
    fila.adicionar(
      novoEnvio({
        id: "a",
        conversationId: "c",
        arquivo: arquivo(),
        legenda: "",
        previa: null,
        agora: "",
      }),
    );
    const antes = fila.todos();
    const envioAntes = antes[0]!;
    fila.atualizar("a", { fase: "falhou", erro: "x" });
    expect(envioAntes.fase).toBe("enviando");
    expect(fila.todos()).not.toBe(antes);
    expect(fila.todos()[0]!.fase).toBe("falhou");
  });

  it("avisa quem assina a cada mudança, e para de avisar depois de cancelar", () => {
    const fila = criarFilaDeEnvios();
    const ouvinte = vi.fn();
    const cancelar = fila.assinar(ouvinte);
    fila.adicionar(
      novoEnvio({
        id: "a",
        conversationId: "c",
        arquivo: arquivo(),
        legenda: "",
        previa: null,
        agora: "",
      }),
    );
    fila.remover("a");
    cancelar();
    fila.adicionar(
      novoEnvio({
        id: "b",
        conversationId: "c",
        arquivo: arquivo(),
        legenda: "",
        previa: null,
        agora: "",
      }),
    );
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });

  it("remover devolve o envio removido (quem chama revoga a prévia)", () => {
    const fila = criarFilaDeEnvios();
    fila.adicionar(
      novoEnvio({
        id: "a",
        conversationId: "c",
        arquivo: arquivo(),
        legenda: "",
        previa: "blob:x",
        agora: "",
      }),
    );
    expect(fila.remover("a")?.previa).toBe("blob:x");
    expect(fila.remover("a")).toBeNull();
  });
});

describe("idsDeEnviosGravados", () => {
  it("acha a bolha local que já virou linha — a mesma marca que o POST grava em metadata", () => {
    const msgs = [
      { metadata: { envio_local: "k-1" } },
      { metadata: null },
      { metadata: { envio_local: 42 } },
    ] as unknown as Message[];
    expect([...idsDeEnviosGravados(msgs)]).toEqual(["k-1"]);
  });
});

describe("executarEnvio", () => {
  const base = () =>
    novoEnvio({
      id: "chave-1",
      conversationId: "conv-1",
      arquivo: arquivo(),
      legenda: "olha isso",
      previa: null,
      agora: "",
    });

  it("sobe e envia o mesmo corpo de antes, com a chave do envio", async () => {
    const d = deps();
    const r = await executarEnvio(base(), d);
    expect(r).toEqual({ ok: true, mensagem: { id: "msg-1" } });
    expect(d.enviar).toHaveBeenCalledWith(
      {
        conversation_id: "conv-1",
        type: "image",
        body: "olha isso",
        media_storage_path: "org/conv-1/a.jpg",
        media_mime: "image/jpeg",
        media_size_bytes: 3,
        metadata: { envio_local: "chave-1" },
      },
      "chave-1",
    );
  });

  it("legenda vazia não vai como corpo", async () => {
    const d = deps();
    await executarEnvio({ ...base(), legenda: "" }, d);
    expect(vi.mocked(d.enviar).mock.calls[0]![0]).not.toHaveProperty("body");
  });

  it("upload falhou: não envia e devolve sem nada subido", async () => {
    const erro = new Error("upload_failed");
    const d = deps({
      subir: vi.fn(async () => {
        throw erro;
      }),
    });
    const r = await executarEnvio(base(), d);
    expect(r).toEqual({ ok: false, erro, subido: null });
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it("envio falhou depois do upload: devolve o que subiu, para a retentativa não subir de novo", async () => {
    const d = deps({
      enviar: vi.fn(async () => {
        throw new Error("rede");
      }),
    });
    const r = await executarEnvio(base(), d);
    expect(r).toMatchObject({ ok: false, subido: SUBIDO });
  });

  it("retentativa com o arquivo já subido pula o upload e repete a MESMA chave", async () => {
    const d = deps();
    await executarEnvio({ ...base(), subido: SUBIDO, fase: "falhou" }, d);
    expect(d.subir).not.toHaveBeenCalled();
    expect(vi.mocked(d.enviar).mock.calls[0]![1]).toBe("chave-1");
  });
});

/**
 * A ORDEM dos anexos de uma resposta rápida é parte do conteúdo.
 *
 * `useEnviosDeMidia.enviar` dispara um envio por arquivo. Sem série, cada um é uma
 * corrente própria de upload + POST, e quem chega primeiro ao servidor é quem sobe
 * mais rápido: numa resposta [áudio, imagem com legenda, áudio] a imagem (maior) é
 * ultrapassada pelo áudio seguinte, e o cliente recebe áudio, áudio, imagem —
 * medido pela spec `respostas-rapidas-conteudos` no CI.
 */
describe("criarSerieDeEnvios — uma conversa envia na ordem em que pediu", () => {
  /** Uma tarefa que só termina quando o teste manda, e registra início e fim. */
  function tarefaManual(registro: string[], nome: string) {
    let terminar!: () => void;
    const tarefa = vi.fn(async () => {
      registro.push(`inicio:${nome}`);
      await new Promise<void>((resolve) => {
        terminar = resolve;
      });
      registro.push(`fim:${nome}`);
    });
    return { tarefa, terminar: () => terminar() };
  }

  it("⭐ a 2ª tarefa da MESMA conversa só começa quando a 1ª termina, mesmo a 1ª sendo a lenta", async () => {
    const naVez = criarSerieDeEnvios();
    const registro: string[] = [];
    const lenta = tarefaManual(registro, "imagem");
    const rapida = tarefaManual(registro, "audio");

    const p1 = naVez("conv-1", lenta.tarefa);
    const p2 = naVez("conv-1", rapida.tarefa);
    await vi.waitFor(() => expect(registro).toEqual(["inicio:imagem"]));
    // Dá tempo de sobra para a 2ª começar, se a série não a segurasse.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(registro).toEqual(["inicio:imagem"]);
    expect(rapida.tarefa).not.toHaveBeenCalled();

    lenta.terminar();
    await p1;
    await vi.waitFor(() =>
      expect(registro).toEqual(["inicio:imagem", "fim:imagem", "inicio:audio"]),
    );
    rapida.terminar();
    await p2;
    expect(registro).toEqual(["inicio:imagem", "fim:imagem", "inicio:audio", "fim:audio"]);
  });

  it("conversas DIFERENTES não esperam uma pela outra", async () => {
    const naVez = criarSerieDeEnvios();
    const registro: string[] = [];
    const a = tarefaManual(registro, "conv-1");
    const b = tarefaManual(registro, "conv-2");

    const pa = naVez("conv-1", a.tarefa);
    const pb = naVez("conv-2", b.tarefa);
    await vi.waitFor(() => expect(registro).toEqual(["inicio:conv-1", "inicio:conv-2"]));

    a.terminar();
    b.terminar();
    await Promise.all([pa, pb]);
  });

  it("uma tarefa que LANÇA não trava a série: a seguinte da mesma conversa roda", async () => {
    const naVez = criarSerieDeEnvios();
    const seguinte = vi.fn(async () => {});

    const p1 = naVez("conv-1", async () => {
      throw new Error("falha inesperada");
    });
    const p2 = naVez("conv-1", seguinte);

    await expect(p1).rejects.toThrow("falha inesperada");
    await p2;
    expect(seguinte).toHaveBeenCalledTimes(1);
  });

  it("⭐ um envio que NUNCA termina (upload preso na rede) não bloqueia a conversa para sempre", async () => {
    // Sem teto, um upload pendurado travaria TODOS os envios seguintes da conversa
    // — antes da série só aquela bolha ficava presa. O teto devolve o comportamento
    // de antes no caso degenerado: passado o prazo, o seguinte sai.
    vi.useFakeTimers();
    try {
      const naVez = criarSerieDeEnvios({ esperaMaximaMs: 5_000 });
      const preso = vi.fn(() => new Promise<void>(() => {}));
      const seguinte = vi.fn(async () => {});

      void naVez("conv-1", preso);
      const p2 = naVez("conv-1", seguinte);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(seguinte).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2);
      await p2;
      expect(seguinte).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("o teto NÃO adianta a tarefa seguinte quando a anterior termina dentro do prazo", async () => {
    vi.useFakeTimers();
    try {
      const naVez = criarSerieDeEnvios({ esperaMaximaMs: 5_000 });
      const registro: string[] = [];
      const lenta = tarefaManual(registro, "imagem");
      const rapida = tarefaManual(registro, "audio");

      const p1 = naVez("conv-1", lenta.tarefa);
      const p2 = naVez("conv-1", rapida.tarefa);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(registro).toEqual(["inicio:imagem"]);

      lenta.terminar();
      await p1;
      await vi.advanceTimersByTimeAsync(0);
      expect(registro).toEqual(["inicio:imagem", "fim:imagem", "inicio:audio"]);
      rapida.terminar();
      await p2;
    } finally {
      vi.useRealTimers();
    }
  });
});
