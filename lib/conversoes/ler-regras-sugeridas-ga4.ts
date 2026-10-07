/**
 * Lê do banco o que `sugerirRegrasGa4` precisa — funis, etapas e regras GA4
 * existentes — SEMPRE filtrado pela organização de quem pede (o admin client
 * ignora RLS). A tela e a action `aplicarRegrasSugeridasGa4` passam por aqui,
 * para que a sugestão exibida e a sugestão revalidada nunca divirjam.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sugerirRegrasGa4,
  type EtapaParaSugestao,
  type FunilParaSugestao,
  type SugestoesDoFunilGa4,
} from "@/lib/conversoes/regras-sugeridas-ga4";

interface LinhaDoFunil {
  id: string;
  name: string;
  settings: unknown;
  is_archived: boolean;
}

interface LinhaDaEtapa {
  id: string;
  pipeline_id: string;
  name: string;
  agent_stage_hint: string | null;
  is_archived: boolean;
}

/**
 * `stageIds` restringe as etapas lidas (a action só revalida o que recebeu);
 * sem ele, lê todas as etapas da organização (a tela).
 */
export async function lerSugestoesDeRegrasGa4(
  admin: SupabaseClient,
  organizationId: string,
  filtro?: { stageIds: readonly string[] },
): Promise<SugestoesDoFunilGa4[]> {
  let consultaDeEtapas = admin
    .from("crm_stages")
    .select("id, pipeline_id, name, agent_stage_hint, is_archived")
    .eq("organization_id", organizationId);
  if (filtro) consultaDeEtapas = consultaDeEtapas.in("id", [...filtro.stageIds]);

  const [funis, etapas, regras] = await Promise.all([
    admin
      .from("crm_pipelines")
      .select("id, name, settings, is_archived")
      .eq("organization_id", organizationId)
      .order("position"),
    consultaDeEtapas.order("position"),
    admin.from("ga4_conversion_rules").select("stage_id").eq("organization_id", organizationId),
  ]);
  if (funis.error || etapas.error || regras.error) {
    throw new Error("Não foi possível ler as sugestões de regras do GA4.");
  }

  return sugerirRegrasGa4({
    funis: ((funis.data ?? []) as LinhaDoFunil[]).map((f): FunilParaSugestao => ({
      id: f.id,
      nome: f.name,
      settings: f.settings,
      arquivado: f.is_archived,
    })),
    etapas: ((etapas.data ?? []) as LinhaDaEtapa[]).map((e): EtapaParaSugestao => ({
      id: e.id,
      pipelineId: e.pipeline_id,
      nome: e.name,
      passo: e.agent_stage_hint,
      arquivada: e.is_archived,
    })),
    regras: ((regras.data ?? []) as Array<{ stage_id: string }>).map((r) => ({
      stageId: r.stage_id,
    })),
  });
}
