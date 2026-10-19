"use client";
import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { estadoDaJanela } from "@/lib/channels/janela";
import { motivoDaJanelaFechada, motivoDoContato } from "@/lib/inbox/motivo-do-envio-bloqueado";

/** O relógio da janela anda sozinho: a janela que vence com a tela aberta precisa fechar o envio. */
const TICK_DA_JANELA_MS = 30_000;

/**
 * POR QUE O COMPOSER NÃO PODE ENVIAR AGORA. Fonte ÚNICA, usada pela Inbox e
 * pelo dossiê do funil.
 *
 * Antes isto morava inline no `InboxLayout`. Levar o composer para o dossiê sem
 * extrair daqui criaria a segunda regra de bloqueio que o próprio `InboxLayout`
 * proíbe ("dois caminhos para desabilitar o mesmo composer divergem, e o segundo
 * esquece de cobrir o áudio ou o anexo").
 */
export function useEnvioDaConversa(conversa: ConversationWithContact | null) {
  const t = useT();
  // `useAuth` e não `useUser`: é a leitura que o `InboxLayout` sempre fez, e os
  // testes da Inbox mockam esta.
  const { user } = useAuth();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), TICK_DA_JANELA_MS);
    return () => clearInterval(id);
  }, []);

  const provider = conversa?.channel_sessions?.provider ?? null;
  const janela = estadoDaJanela(provider, conversa?.last_inbound_at ?? null, agora);
  const motivoDaJanela = motivoDaJanelaFechada(janela, provider, t);
  const somenteLeitura = user.support?.access_mode === "support_readonly";
  const blockedReason = somenteLeitura
    ? "Acompanhamento somente leitura"
    : motivoDoContato(conversa?.contacts, t);

  return { motivoDaJanela, blockedReason, fechada: conversa?.status === "closed", somenteLeitura };
}
