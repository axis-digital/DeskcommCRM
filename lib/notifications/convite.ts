import type { NotificationPermissionState } from "./permission";

const CONVITE_DISPENSADO_KEY = "notify.convite.dispensado";

/**
 * QUANDO A INBOX CONVIDA A LIGAR AS NOTIFICAÇÕES DA ÁREA DE TRABALHO.
 *
 * Até aqui a permissão do navegador só era pedida em Configurações ›
 * Notificações. Quem nunca abria aquela tela nunca recebia aviso de mensagem
 * nova com o CRM em outra aba — a funcionalidade existia e ficava invisível.
 *
 * Só convida quando um clique resolve: `default` é o único estado em que
 * `Notification.requestPermission()` mostra o pedido. Em `denied` o navegador
 * nem pergunta (liberar é nas configurações do site, e a tela de
 * Notificações já diz isso); em `granted` não há o que pedir.
 */
export function deveConvidarParaNotificacoes(input: {
  permission: NotificationPermissionState;
  pushDeMensagemLigado: boolean;
  dispensado: boolean;
}): boolean {
  return input.permission === "default" && input.pushDeMensagemLigado && !input.dispensado;
}

/**
 * A dispensa ("Agora não") é por navegador, no `localStorage`, como as demais
 * preferências de aviso (`prefs.ts`). É um external store pelo mesmo motivo
 * de `permission.ts`: ler no render, sem a janela de um `useEffect`.
 */
type OuvinteDoConvite = () => void;
const ouvintes = new Set<OuvinteDoConvite>();

export function assinarConvite(ouvinte: OuvinteDoConvite): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function conviteDispensado(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(CONVITE_DISPENSADO_KEY) === "1";
  } catch {
    // localStorage bloqueado — sem onde lembrar a dispensa, não insiste
    return true;
  }
}

/** No servidor a faixa não existe: o único flash possível é o de aparecer. */
export function conviteDispensadoNoServidor(): boolean {
  return true;
}

export function dispensarConvite(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONVITE_DISPENSADO_KEY, "1");
  } catch {
    // ignore
  }
  for (const ouvinte of ouvintes) ouvinte();
}
