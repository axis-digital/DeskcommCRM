"use server";

/**
 * Aplica as REGRAS SUGERIDAS do GA4 (painel "Regras sugeridas" da tela de
 * Conversões): cria `ga4_conversion_rules` ligadas SÓ nas etapas que ainda não
 * têm regra. Nunca sobrescreve — a regra existente pode ter sido escolhida à
 * mão, e o insert usa `on conflict do nothing` para o caso de outra aba criar
 * a mesma regra entre a leitura e a escrita.
 *
 * O servidor não confia no par etapa → evento que a tela manda: RECALCULA a
 * sugestão (`lerSugestoesDeRegrasGa4`, filtrada pela organização da sessão,
 * nunca do body) e recusa o lote inteiro se algum par não for exatamente o que
 * ela produz — etapa de outra organização, funil arquivado, etapa sem passo e
 * evento trocado caem todos aqui.
 *
 * Mesma guarda de `salvarRegrasDeConversaoGa4.ts`: suporte, organização ativa,
 * administrador da empresa e MFA. Audita só quando criou alguma regra.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { lerSugestoesDeRegrasGa4 } from "@/lib/conversoes/ler-regras-sugeridas-ga4";
import { eventoDaEtapaGa4, VALORES_DE_EVENTO_DE_ETAPA_GA4 } from "@/lib/conversoes/regras-ga4";
import { paresAplicaveis } from "@/lib/conversoes/regras-sugeridas-ga4";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export type AplicarRegrasSugeridasGa4Result =
  | { ok: true; criadas: number }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "sugestao_invalida"
        | "erro_ao_gravar";
      details?: unknown;
    };

const sugestaoSchema = z.object({
  stageId: z.uuid(),
  evento: z.enum(VALORES_DE_EVENTO_DE_ETAPA_GA4),
});

const entradaSchema = z
  .array(sugestaoSchema)
  .min(1)
  .max(200)
  .refine((lista) => new Set(lista.map((s) => s.stageId)).size === lista.length, {
    message: "Etapa repetida.",
  });

export type SugestaoGa4Input = z.input<typeof sugestaoSchema>;

export async function aplicarRegrasSugeridasGa4(
  input: SugestaoGa4Input[],
): Promise<AplicarRegrasSugeridasGa4Result> {
  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden_role" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!podeAdministrarEmpresa(authUser, activeOrg)) {
    return { ok: false, error: "forbidden_role" };
  }
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const orgId = activeOrg.orgId;
  const pedidas = parsed.data;

  let sugestoes;
  try {
    sugestoes = await lerSugestoesDeRegrasGa4(admin, orgId, {
      stageIds: pedidas.map((p) => p.stageId),
    });
  } catch {
    return { ok: false, error: "erro_ao_gravar" };
  }

  const propostaPorEtapa = new Map(
    sugestoes.flatMap((f) => f.propostas.map((p) => [p.stageId, p] as const)),
  );
  const divergentes = pedidas.filter((p) => propostaPorEtapa.get(p.stageId)?.evento !== p.evento);
  if (divergentes.length > 0) {
    return {
      ok: false,
      error: "sugestao_invalida",
      details: { etapas: divergentes.map((d) => d.stageId) },
    };
  }

  // Etapa que ganhou regra desde que a tela foi aberta é pulada, não recusada.
  const aplicaveis = paresAplicaveis(sugestoes);
  const linhas = pedidas
    .filter((p) => aplicaveis.has(p.stageId))
    .map((p) => ({
      organization_id: orgId,
      stage_id: p.stageId,
      event_name: eventoDaEtapaGa4(p.stageId),
      ga4_event: p.evento,
      enabled: true,
      updated_by: authUser.id,
    }));

  if (linhas.length === 0) return { ok: true, criadas: 0 };

  const { data: criadas, error } = await admin
    .from("ga4_conversion_rules")
    .upsert(linhas, { onConflict: "organization_id,stage_id", ignoreDuplicates: true })
    .select("stage_id");
  if (error) return { ok: false, error: "erro_ao_gravar", details: error.message };
  const quantas = (criadas ?? []).length;

  if (quantas > 0) {
    const hdrs = await headers();
    await audit({
      action: "ga4_conversion_rules.updated",
      actorUserId: authUser.id,
      organizationId: orgId,
      resourceType: "ga4_conversion_rules",
      resourceId: null,
      requestId: hdrs.get("x-request-id") ?? undefined,
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: hdrs.get("user-agent") ?? undefined,
      metadata: {
        origem: "regras_sugeridas",
        criadas: quantas,
        ignoradas: pedidas.length - quantas,
      },
    });
  }

  revalidatePath("/app/settings/conversoes");
  return { ok: true, criadas: quantas };
}
