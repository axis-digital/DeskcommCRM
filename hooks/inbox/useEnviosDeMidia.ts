"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { colocarMensagemNoCache } from "@/hooks/inbox/cacheDasMensagens";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import {
  criarFilaDeEnvios,
  criarSerieDeEnvios,
  executarEnvio,
  novoEnvio,
  type DepsDoEnvio,
  type EnvioDeMidia,
} from "@/lib/messaging/media/envio-otimista";
import { subirMidia } from "@/lib/messaging/media/subir-midia";
import { randomId } from "@/lib/random-id";
import type { Message } from "@/lib/types/messaging";

/**
 * Uma fila só, no módulo: o envio continua quando o atendente troca de
 * conversa, e a bolha está lá quando ele volta.
 */
const fila = criarFilaDeEnvios();

/**
 * Os envios de uma conversa saem na ordem em que foram pedidos. A ordem dos anexos
 * de uma resposta rápida é parte do conteúdo, e sem a série a imagem (que sobe mais
 * devagar) era ultrapassada pelo áudio seguinte.
 */
const naVez = criarSerieDeEnvios();

/**
 * Prazo do POST da mídia. Maior que o `MUTATION_TIMEOUT_MS` do apiClient (30s)
 * de propósito: o servidor espera o WAHA por até 30s, e um cliente que desiste
 * no mesmo segundo marca "não enviada" uma mensagem que o servidor gravou.
 * Aqui ninguém fica esperando na tela — o envio corre em segundo plano.
 */
const PRAZO_DO_ENVIO_MS = 60_000;

const deps: DepsDoEnvio = {
  subir: ({ conversationId, arquivo }) =>
    subirMidia({ conversationId, file: arquivo, destino: "mensagem" }),
  enviar: async (corpo, chave) =>
    (
      await apiClient.post<{ data: Message }>("/api/v1/messages", corpo, {
        idempotencyKey: chave,
        timeoutMs: PRAZO_DO_ENVIO_MS,
      })
    ).data,
};

function motivoDaFalha(erro: unknown): string {
  if (erro instanceof ApiError && erro.message) return erro.message;
  return "Não foi possível enviar. Verifique a conexão.";
}

function descartarDaFila(id: string) {
  const removido = fila.remover(id);
  if (removido?.previa) URL.revokeObjectURL(removido.previa);
}

export function useEnviosDeMidia(conversationId: string | null) {
  const qc = useQueryClient();
  const todos = useSyncExternalStore(fila.assinar, fila.todos, fila.todos);
  const pendentes = useMemo(
    () => (conversationId ? fila.daConversa(todos, conversationId) : []),
    [todos, conversationId],
  );

  const rodar = useCallback(
    async (envio: EnvioDeMidia) => {
      fila.atualizar(envio.id, { fase: "enviando", erro: null });
      const desfecho = await executarEnvio(envio, deps);
      if (!desfecho.ok) {
        fila.atualizar(envio.id, {
          fase: "falhou",
          erro: motivoDaFalha(desfecho.erro),
          subido: desfecho.subido,
        });
        return;
      }
      // A linha real entra no cache e a local sai no MESMO tique: o React
      // junta as duas atualizações, e a bolha não pisca nem aparece em dobro.
      colocarMensagemNoCache(qc, envio.conversationId, desfecho.mensagem);
      descartarDaFila(envio.id);
      void qc.invalidateQueries({ queryKey: ["messages", envio.conversationId] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    [qc],
  );

  const enviar = useCallback(
    (args: { conversationId: string; arquivo: File; legenda: string }) => {
      const previa = /^(image|video)\//.test(args.arquivo.type)
        ? URL.createObjectURL(args.arquivo)
        : null;
      const envio = novoEnvio({ ...args, id: randomId(), previa, agora: new Date().toISOString() });
      fila.adicionar(envio);
      void naVez(args.conversationId, () => rodar(envio));
    },
    [rodar],
  );

  const tentarDeNovo = useCallback(
    (id: string) => {
      const envio = fila.todos().find((e) => e.id === id);
      if (envio?.fase === "falhou") void rodar(envio);
    },
    [rodar],
  );

  return { pendentes, enviar, tentarDeNovo, descartar: descartarDaFila };
}
