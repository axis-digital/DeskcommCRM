"use client";
import { useState, type ComponentProps } from "react";

import { useT } from "@/hooks/i18n/useT";
import { isNotFound, useConversation } from "@/hooks/inbox/useConversation";
import { useEnvioDaConversa } from "@/hooks/inbox/useEnvioDaConversa";
import { useMarkAsRead } from "@/hooks/inbox/useMarkAsRead";
import { JanelaFechadaAviso } from "@/components/inbox/JanelaFechadaAviso";
import { NumeroForaDoAr } from "@/components/inbox/NumeroForaDoAr";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { RetentionNotice } from "./RetentionNotice";

type Respondendo = Parameters<NonNullable<ComponentProps<typeof ChatThread>["onResponder"]>>[0];

type ModoDoRascunho = "reply" | "note";

/**
 * Rascunho por conversa, vivo enquanto a aba vive. Fechar o dossiê (Esc,
 * clique fora, X) desmonta o composer; sem isto a resposta pela metade
 * sumiria, e o atendente aprenderia que no funil "não dá para confiar".
 *
 * Guarda também o MODO: uma nota interna que voltasse como resposta iria para o
 * cliente. Campo vazio apaga a entrada — o texto velho nunca ressuscita, e o
 * mapa não cresce com uma linha vazia por conversa aberta. (As menções de uma
 * nota não são guardadas: o nome volta como texto, sem o vínculo com a pessoa.)
 */
const rascunhos = new Map<string, { texto: string; modo: ModoDoRascunho }>();
export const rascunhoEmbutido = (conversationId: string) => rascunhos.get(conversationId)?.texto ?? "";
const modoDoRascunho = (conversationId: string): ModoDoRascunho =>
  rascunhos.get(conversationId)?.modo ?? "reply";

/**
 * A conversa da Inbox fora da Inbox: os MESMOS `ChatThread` e `Composer`, com
 * as guardas de `useEnvioDaConversa`. Não é uma segunda implementação. O que
 * fica só na Inbox: busca, atalhos J/K, painel CRM e rascunho sugerido pela IA.
 */
export function ConversaEmbutida(props: {
  conversationId: string;
  onTrocarConversa?: (id: string) => void;
}) {
  // Uma instância por conversa: a citação escolhida (`respondendo`) e o aviso de
  // "número fora do ar" são DESTA conversa. Sem a chave, trocar de conversa
  // (pelo "Abrir conversa" do aviso, ou quando o quadro atualiza o negócio)
  // levava a citação da conversa A para o composer da B.
  return <ConversaDaVez key={props.conversationId} {...props} />;
}

function ConversaDaVez({
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
  // Ler no dossiê é ler: sem isto o contador do card, o selo da aba e a lista da
  // Inbox seguiam acesos até alguém abrir a conversa na Inbox.
  useMarkAsRead(conversa?.id ?? null, conversa?.unread_count_for_assignee ?? 0);
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
        initialMode={modoDoRascunho(conversa.id)}
        onDraftChange={(texto, modo) => {
          if (texto === "") rascunhos.delete(conversa.id);
          else rascunhos.set(conversa.id, { texto, modo });
        }}
      />
    </div>
  );
}
