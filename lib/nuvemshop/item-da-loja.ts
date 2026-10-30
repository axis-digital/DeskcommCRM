import { corpoDoEventoDoSite, ehEventoDoSite, rotuloDoEventoDoSite } from "./evento-do-site-na-timeline";
import { ROTULO_DO_PEDIDO, corpoDoPedido, ehPedidoDaTimeline } from "./pedido-na-timeline";

/**
 * Como a linha do tempo do contato escreve o que veio da loja: o pedido (projetado
 * de `orders`) e os eventos do site (`site_events`). Atividade comum devolve `null`
 * e a tela segue o caminho de sempre (vocabulário de atividades).
 */
export function descreverItemDaLoja(
  item: { type: string; payload: Record<string, unknown> },
  t: (texto: string) => string = (texto) => texto,
): { rotulo: string; corpo: string } | null {
  if (ehPedidoDaTimeline(item)) {
    return { rotulo: t(ROTULO_DO_PEDIDO), corpo: corpoDoPedido(item.payload, t) };
  }
  if (ehEventoDoSite(item)) {
    return { rotulo: t(rotuloDoEventoDoSite(item.type)), corpo: corpoDoEventoDoSite(item.type, item.payload, t) };
  }
  return null;
}
