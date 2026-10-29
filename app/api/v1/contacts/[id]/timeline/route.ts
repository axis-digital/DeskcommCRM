/**
 * GET /api/v1/contacts/[id]/timeline
 *
 * Returns polymorphic timeline (`crm_lead_activities`) for a contact, merging
 * direct `contact_id` activities with activities attached to leads owned by
 * this contact. Two RLS-scoped queries client-side (supabase-js does not
 * compose `.or` with subqueries cleanly), then merge → sort → cursor-paginate.
 *
 * Filters:
 *   - type: repeatable query param (?type=order_created&type=message_inbound)
 *   - cursor: opaque base64 of (performed_at, id)
 *   - limit: 1..100 (default 50)
 *
 * ESTA ROTA NÃO É O DOSSIÊ DO NEGÓCIO. Ela é a vida do CONTATO, e por isso
 * soma os negócios dele — o que no dossiê de UM negócio apareceria como
 * história do irmão. O dossiê usa `leads/[id]/timeline`, ancorada no lead;
 * as duas dividem as peças de `lib/leads/timeline-query.ts` e divergem só na
 * cláusula, que é justamente onde a diferença mora.
 *
 * OS PEDIDOS DA LOJA (`orders`) ENTRAM AQUI, E SÓ AQUI. `crm_lead_activities.
 * lead_id` é NOT NULL, então quem só comprou (sem negócio) nunca teria linha de
 * atividade. A rota projeta o pedido no mesmo formato, em tempo de leitura —
 * ver `lib/nuvemshop/pedido-na-timeline.ts`. O dossiê do NEGÓCIO não os mostra:
 * pedido é do contato, não de um negócio.
 *
 * OS EVENTOS DO SITE (`site_events`: cadastro na loja, carrinho abandonado etc.)
 * também entram aqui. Diferente do pedido eles têm tabela própria, porque não há
 * fonte de origem para projetar (o carrinho abandonado some da API em 30 dias).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { loadAuthUser } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import type { TimelineItem, TimelineItemDoContato } from "@/lib/types/contacts";
import {
  EVENTO_COLS,
  TIPOS_DE_EVENTO_DO_SITE,
  eventoDoSiteParaItemDaTimeline,
  type EventoDoSiteLido,
} from "@/lib/nuvemshop/evento-do-site-na-timeline";
import {
  PEDIDO_COLS,
  TIPO_PEDIDO_NA_TIMELINE,
  pedidoParaItemDaTimeline,
  type PedidoParaTimeline,
} from "@/lib/nuvemshop/pedido-na-timeline";
import {
  TIMELINE_COLS,
  comNomeDoAtor,
  decodeCursor,
  encodeCursor,
  type Cursor,
} from "@/lib/leads/timeline-query";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: contactId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const authUser = await loadAuthUser();
  const t = (texto: string) => traduzir(texto, authUser?.idioma ?? "pt-BR");

  const url = new URL(req.url);
  const types = url.searchParams.getAll("type").filter(Boolean);
  const cursorRaw = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "50", 10) || 50, 1), 100);

  let cursor: Cursor | null = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      return fail("invalid_cursor", t("Cursor inválido."), 400, { requestId });
    }
  }

  // Verify contact accessible (RLS will filter); 404 if not.
  const { data: contactRow, error: cErr } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", contactId)
    .maybeSingle();
  if (cErr) return fail("internal_error", cErr.message, 500, { requestId });
  if (!contactRow) return fail("not_found", t("Contato não encontrado."), 404, { requestId });

  // Resolve owned lead ids first.
  const { data: leadRows, error: lErr } = await supabase
    .from("crm_leads")
    .select("id")
    .eq("contact_id", contactId);
  if (lErr) return fail("internal_error", lErr.message, 500, { requestId });

  const leadIds = (leadRows ?? []).map((r) => (r as { id: string }).id);

  // Pull last (limit + 1) from each side to detect has_more after merge.
  // We over-fetch slightly to keep merge correct.
  const FETCH = limit + 1;

  const buildQuery = (column: "contact_id" | "lead_id", values: string | string[]) => {
    let q = supabase
      .from("crm_lead_activities")
      .select(TIMELINE_COLS)
      .order("performed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(FETCH);
    if (Array.isArray(values)) q = q.in(column, values);
    else q = q.eq(column, values);
    if (types.length > 0) q = q.in("type", types);
    if (cursor) {
      q = q.or(
        `performed_at.lt.${cursor.performed_at},and(performed_at.eq.${cursor.performed_at},id.lt.${cursor.id})`,
      );
    }
    return q;
  };

  const directQ = buildQuery("contact_id", contactId);
  const leadQ =
    leadIds.length > 0 ? buildQuery("lead_id", leadIds) : Promise.resolve({ data: [], error: null });

  // Os pedidos da loja: só entram quando o filtro `?type=` não os exclui, e a
  // consulta é por contato E organização — a RLS já filtra, mas a organização
  // vem da LINHA do contato (fonte confiável), nunca de parâmetro da chamada.
  const incluiPedidos = types.length === 0 || types.includes(TIPO_PEDIDO_NA_TIMELINE);
  const pedidosQ = incluiPedidos
    ? (() => {
        let q = supabase
          .from("orders")
          .select(PEDIDO_COLS)
          .eq("contact_id", contactId)
          .eq("organization_id", contactRow.organization_id)
          .order("ordered_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(FETCH);
        if (cursor) {
          q = q.or(
            `ordered_at.lt.${cursor.performed_at},and(ordered_at.eq.${cursor.performed_at},id.lt.${cursor.id})`,
          );
        }
        return q;
      })()
    : Promise.resolve({ data: [], error: null });

  // Os eventos do site: `?type=` de atividade comum os exclui, e `?type=` de um
  // tipo de evento filtra por ele. Mesma regra de contato e organização do pedido.
  const tiposDeEvento = types.filter((t) => (TIPOS_DE_EVENTO_DO_SITE as readonly string[]).includes(t));
  const incluiEventos = types.length === 0 || tiposDeEvento.length > 0;
  const eventosQ = incluiEventos
    ? (() => {
        let q = supabase
          .from("site_events")
          .select(EVENTO_COLS)
          .eq("contact_id", contactId)
          .eq("organization_id", contactRow.organization_id)
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(FETCH);
        if (tiposDeEvento.length > 0) q = q.in("kind", tiposDeEvento);
        if (cursor) {
          q = q.or(
            `occurred_at.lt.${cursor.performed_at},and(occurred_at.eq.${cursor.performed_at},id.lt.${cursor.id})`,
          );
        }
        return q;
      })()
    : Promise.resolve({ data: [], error: null });

  const [directRes, leadRes, pedidosRes, eventosRes] = await Promise.all([directQ, leadQ, pedidosQ, eventosQ]);

  if (directRes.error) {
    return fail("internal_error", directRes.error.message, 500, { requestId });
  }
  if ("error" in leadRes && leadRes.error) {
    return fail("internal_error", leadRes.error.message, 500, { requestId });
  }
  if (pedidosRes.error) {
    return fail("internal_error", pedidosRes.error.message, 500, { requestId });
  }
  if (eventosRes.error) {
    return fail("internal_error", eventosRes.error.message, 500, { requestId });
  }

  // Cast duplo porque a lista de colunas agora é montada com `join()`: o
  // supabase-js infere o shape a partir da STRING LITERAL do select, e a
  // string dinâmica apaga essa inferência (vira GenericStringError[]). A troca
  // é deliberada — perde-se uma inferência que já não protegia contra o bug
  // real (campo do tipo fora do SELECT compilava verde) e ganha-se o portão de
  // exaustividade acima, que protege.
  const merged = new Map<string, TimelineItem | TimelineItemDoContato>();
  for (const row of (directRes.data ?? []) as unknown as TimelineItem[]) merged.set(row.id, row);
  for (const row of (leadRes.data ?? []) as unknown as TimelineItem[]) merged.set(row.id, row);
  for (const row of (pedidosRes.data ?? []) as unknown as PedidoParaTimeline[]) {
    merged.set(row.id, pedidoParaItemDaTimeline(row));
  }
  for (const row of (eventosRes.data ?? []) as unknown as EventoDoSiteLido[]) {
    merged.set(row.id, eventoDoSiteParaItemDaTimeline(row));
  }

  const sorted = Array.from(merged.values()).sort((a, b) => {
    if (a.performed_at !== b.performed_at) {
      return a.performed_at < b.performed_at ? 1 : -1;
    }
    return a.id < b.id ? 1 : -1;
  });

  const hasMore = sorted.length > limit;
  const pageRows = hasMore ? sorted.slice(0, limit) : sorted;

  // Quem agiu, com NOME — resolvido aqui, na borda, e não na tela. É a mesma
  // decisão do dono agente no board: o dado de exibição viaja com a linha, em
  // vez de a tela ter de descobrir sozinha (e mostrar "Agente" genérico quando
  // não descobre). Sem filtro de is_active/archived: quem AGIU agiu, mesmo que
  // o agente tenha sido desligado depois.
  // O nome do ator só se resolve para as ATIVIDADES (`lead_id` presente): o
  // pedido já sai pronto, com o cliente como ator e sem ninguém a consultar.
  const atividadesDaPagina = pageRows.filter((r): r is TimelineItem => r.lead_id !== null);
  const nomeadas = new Map((await comNomeDoAtor(supabase, atividadesDaPagina)).map((r) => [r.id, r]));
  const page = pageRows.map((r) => nomeadas.get(r.id) ?? r);
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ performed_at: last.performed_at, id: last.id })
      : null;

  return ok(page, {
    requestId,
    meta: { cursor: nextCursor, has_more: hasMore },
  });
}
