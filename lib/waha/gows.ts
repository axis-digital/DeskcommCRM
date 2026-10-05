/**
 * Leitura do payload do engine GOWS (fork Axis — o upstream só mede NOWEB).
 *
 * O GOWS entrega o MESMO evento com outra casca:
 *   - conteúdo em `_data.Message` (maiúsculo), não em `_data.message`;
 *   - metadados em `_data.Info` (`Chat`, `IsFromMe`, `IsGroup`, `PushName`);
 *   - o telefone de um chat `@lid` em `Info.SenderAlt` (recebida) ou
 *     `Info.RecipientAlt` (enviada pelo celular), não em `_data.key.remoteJidAlt`.
 *
 * Sem ler o telefone, toda mensagem ao vivo de um contato que o WhatsApp já
 * migrou para LID nascia num contato novo, sem telefone, ao lado do contato
 * importado pelo histórico — a conversa "perdia" mensagens para a duplicata.
 * Medido em 2026-10-05: 4 de 5 contatos só-LID eram a mesma pessoa de um
 * contato com telefone.
 */
import type { WahaPayload } from "@/lib/waha/envelope";

type Registro = Record<string, unknown>;

function registro(v: unknown): Registro | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Registro) : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/** `_data.Info` do GOWS, ou null em qualquer outro engine. */
export function infoDoGows(p: WahaPayload): Registro | null {
  return registro(registro(p._data)?.Info);
}

/** O conteúdo da mensagem, venha do NOWEB (`message`) ou do GOWS (`Message`). */
export function conteudoDaMensagem(p: WahaPayload): Registro | null {
  const d = registro(p._data);
  return registro(d?.message) ?? registro(d?.Message);
}

/** Nome que o remetente se deu no WhatsApp (`Info.PushName`). */
export function pushNameDoGows(p: WahaPayload): string | null {
  return texto(infoDoGows(p)?.PushName);
}

/**
 * O JID de TELEFONE do outro lado de um chat 1:1 no GOWS: `SenderAlt` quando a
 * mensagem chegou, `RecipientAlt` quando saiu do celular. Em grupo, `SenderAlt`
 * é o autor e não o chat — por isso grupo devolve null.
 *
 * A direção é a PARTE perigosa: numa mensagem que saiu do celular, `SenderAlt`
 * é o número do operador, e gravá-lo no contato do cliente funde o cliente na
 * loja. Por isso `p.fromMe` e `Info.IsFromMe` têm de concordar; se divergirem,
 * ou se nenhum disser a direção, não há telefone.
 */
export function jidAlternativoDoGows(p: WahaPayload): string | null {
  const info = infoDoGows(p);
  if (!info || info.IsGroup === true) return null;
  const doPayload = typeof p.fromMe === "boolean" ? p.fromMe : null;
  const doInfo = typeof info.IsFromMe === "boolean" ? info.IsFromMe : null;
  if (doPayload !== null && doInfo !== null && doPayload !== doInfo) return null;
  const deMim = doPayload ?? doInfo;
  if (deMim === null) return null;
  return texto(deMim ? info.RecipientAlt : info.SenderAlt);
}

/**
 * Texto legível de um conteúdo sem `body`. Lista FECHADA de caminhos conhecidos
 * — varrer chaves atrás de "qualquer string" pegaria campo técnico
 * (`senderKeyHash`) e o gravaria como mensagem do cliente.
 */
export function textoDoConteudo(msg: Registro | null): string | null {
  if (!msg) return null;
  const em = (...caminho: string[]): string | null => {
    let atual: unknown = msg;
    for (const passo of caminho) atual = registro(atual)?.[passo];
    return texto(atual);
  };
  return (
    em("conversation") ??
    em("extendedTextMessage", "text") ??
    // Cartão de contato: o vcard inteiro, como o NOWEB sempre gravou.
    em("contactMessage", "vcard") ??
    em("contactMessage", "displayName") ??
    // Template de empresa (notificação de pedido, relatório…): três grafias.
    em("templateMessage", "hydratedTemplate", "hydratedContentText") ??
    em("templateMessage", "interactiveMessageTemplate", "body", "text") ??
    em("templateMessage", "Format", "InteractiveMessageTemplate", "body", "text") ??
    em("buttonsMessage", "contentText") ??
    em("interactiveMessage", "body", "text") ??
    em("listMessage", "description") ??
    null
  );
}
