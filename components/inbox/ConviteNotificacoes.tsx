"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useNotificationPermission } from "@/hooks/notifications/useNotificationPermission";
import {
  assinarConvite,
  conviteDispensado,
  conviteDispensadoNoServidor,
  deveConvidarParaNotificacoes,
  dispensarConvite,
} from "@/lib/notifications/convite";
import { assinarPrefs, getPrefsSnapshot, getPrefsSnapshotDoServidor } from "@/lib/notifications/prefs";
import { Bell, X } from "@/lib/ui/icons";

/**
 * Convite para ligar as notificações da área de trabalho, no topo da lista.
 *
 * O aviso de mensagem nova na bandeja do sistema já existia
 * (`useInboundMessageAlerts` → `emitNotification`), mas a permissão do
 * navegador só era pedida em Configurações › Notificações. Esta faixa leva o
 * pedido para onde quem atende já está. A regra de quando aparecer mora em
 * `deveConvidarParaNotificacoes`; conceder ou negar muda a permissão e ela some
 * sozinha (a permissão é um external store).
 */
export function ConviteNotificacoes() {
  const t = useT();
  const { permission, request } = useNotificationPermission();
  const prefs = useSyncExternalStore(assinarPrefs, getPrefsSnapshot, getPrefsSnapshotDoServidor);
  const dispensado = useSyncExternalStore(
    assinarConvite,
    conviteDispensado,
    conviteDispensadoNoServidor,
  );

  if (
    !deveConvidarParaNotificacoes({
      permission,
      pushDeMensagemLigado: prefs.message.push,
      dispensado,
    })
  ) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="convite-notificacoes"
      className="flex items-start gap-2 border-b border-border bg-primary/5 px-3 py-2 text-sm"
    >
      <Bell size={16} aria-hidden className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="leading-snug">
          {t("Receba aviso de mensagem nova mesmo com o CRM em outra aba.")}
        </p>
        <Button size="sm" className="mt-1.5" onClick={() => void request()}>
          {t("Ativar notificações")}
        </Button>
      </div>
      <button
        type="button"
        aria-label={t("Agora não")}
        title={t("Agora não")}
        onClick={dispensarConvite}
        className="-mt-0.5 -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
