"use client";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { Message } from "@/lib/types/messaging";

export interface MessagesPage {
  data: Message[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

/**
 * Põe a linha que o POST devolveu na primeira página da conversa, tirando
 * antes a cópia temporária (texto otimista) e a própria linha, caso o
 * Realtime já a tenha trazido — sem isso a mesma mensagem apareceria duas
 * vezes. Usado pelo envio de texto e pela bolha otimista de mídia.
 */
export function colocarMensagemNoCache(
  qc: QueryClient,
  conversationId: string,
  real: Message,
  tempId?: string,
) {
  qc.setQueryData<InfiniteData<MessagesPage>>(["messages", conversationId], (old) => {
    if (!old || old.pages.length === 0) return old;
    const pages = old.pages.map((page) => ({
      ...page,
      data: page.data.filter((m) => m.id !== tempId && m.id !== real.id),
    }));
    pages[0] = { ...pages[0]!, data: [...pages[0]!.data, real] };
    return { ...old, pages };
  });
}
