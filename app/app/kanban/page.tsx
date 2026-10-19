import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { escolherFunilPadrao } from "@/lib/kanban/funil-padrao";

export const dynamic = "force-dynamic";

/**
 * A aba "Funis" abre o QUADRO, não a lista (pedido do dono, 2026-10-15).
 *
 * - `?lead=<id>` é deep link de negócio: abre o funil DELE, não o padrão.
 *   No padrão o dossiê não abriria, porque o negócio não está naquele quadro.
 * - Sem nenhum funil vivo, a lista em `/app/kanban/funis` tem o estado vazio
 *   que ensina a criar o primeiro.
 * - O filtro de `organization_id` não é redundante com a RLS: ela libera todas
 *   as organizações do usuário (ver o cabeçalho de `funis/page.tsx`).
 */
export default async function FunilDaAbaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const params = await searchParams;
  const leadId = typeof params.lead === "string" ? params.lead : null;
  const supabase = await createClient();

  if (leadId) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("pipeline_id")
      .eq("organization_id", activeOrg.orgId)
      .eq("id", leadId)
      .maybeSingle();
    if (lead?.pipeline_id) {
      redirect(`/app/pipelines/${lead.pipeline_id}?lead=${encodeURIComponent(leadId)}`);
    }
  }

  const { data } = await supabase
    .from("crm_pipelines")
    .select("id, name, position, is_default, is_archived")
    .eq("organization_id", activeOrg.orgId);

  const padrao = escolherFunilPadrao(data ?? []);
  if (!padrao) redirect("/app/kanban/funis");
  redirect(`/app/pipelines/${padrao.id}`);
}
