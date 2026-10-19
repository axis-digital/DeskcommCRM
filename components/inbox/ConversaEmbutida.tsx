"use client";
import { useState, type ComponentProps } from "react";

import { useT } from "@/hooks/i18n/useT";
import { isNotFound, useConversation } from "@/hooks/inbox/useConversation";
import { useEnvioDaConversa } from "@/hooks/inbox/useEnvioDaConversa";
import { JanelaFechadaAviso } from "@/components/inbox/JanelaFechadaAviso";
import { NumeroForaDoAr } from "@/components/inbox/NumeroForaDoAr";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { RetentionNotice } from "./RetentionNotice";

type Respondendo = Parameters<NonNullable<ComponentProps<typeof ChatThread>["onResponder"]>>[0];

/**
 * Rascunho por conversa, vivo enquanto a aba vive. Fechar o dossiê (Esc,
 * clique fora, X) desmonta o composer; sem isto a resposta pela metade
 * sumiria, e o atendente aprenderia que no funil "não dá para confiar".
 */
const rascunhos = new Map<string, string>();
export const rascunhoEmbutido = (conversationId: string) => rascunhos.get(conversationId) ?? "";

/**
 * A conversa da Inbox fora da Inbox: os MESMOS `ChatThread` e `Composer`, com
 * as guardas de `useEnvioDaConversa`. Não é uma segunda implementação. O que
 * fica só na Inbox: busca, atalhos J/K, painel CRM e rascunho sugerido pela IA.
 */
export function ConversaEmbutida({
  conversationId,
  onTrocarConversa,
}: {
  conversationId: string;
  onTrocarConversa?: (id: string) => void;
}) {
  const t = useT();
  const q = useConversation(conversationId, true);
  const conversa = q.data ?? null;
  const envio = useEnvioDaConversa(conversa);
  const [respondendo, setRespondendo] = useState<Respondendo | null>(null);

  if (q.isLoading) {
    return (
      <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("Carregando conversa…")}
      </div>
    );
  }
  if (!conversa) {
    return (
      <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {q.error && !isNotFound(q.error)
          ? t("Não foi possível carregar a conversa.")
          : t("Conversa não encontrada ou fora do seu acesso.")}
      </p>
    );
  }

  const provider = conversa.channel_sessions?.provider ?? null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatThread
          conversationId={conversa.id}
          provider={provider}
          onResponder={setRespondendo}
          dono={{
            userId: conversa.assigned_to_user_id ?? null,
            nome: conversa.assigned_to_user_name ?? null,
          }}
          contatoId={conversa.contacts?.id ?? null}
        />
      </div>
      <RetentionNotice conversationId={conversa.id} />
      {conversa.contacts?.id && onTrocarConversa && (
        <NumeroForaDoAr
          conversationId={conversa.id}
          channelSessionId={conversa.channel_session_id}
          contactId={conversa.contacts.id}
          contactPhone={conversa.contacts.phone_number ?? null}
          onAbrirConversa={onTrocarConversa}
        />
      )}
      {envio.motivoDaJanela && (
        <JanelaFechadaAviso conversationId={conversa.id} provider={provider} motivo={envio.motivoDaJanela} />
      )}
      <Composer
        key={conversa.id}
        conversationId={conversa.id}
        blockedReason={envio.blockedReason}
        janelaFechada={envio.motivoDaJanela}
        disabled={envio.fechada}
        contactName={conversa.contacts?.name ?? null}
        contactDisplayName={conversa.contacts?.display_name}
        respondendo={respondendo}
        onCancelarResposta={() => setRespondendo(null)}
        currentContactId={conversa.contact_id}
        initialDraft={rascunhoEmbutido(conversa.id)}
        onDraftChange={(texto, modo) => {
          if (modo === "reply") rascunhos.set(conversa.id, texto);
        }}
      />
    </div>
  );
}
