"use server";

/**
 * Grava as regras de conversão do GA4 por etapa (`ga4_conversion_rules`).
 *
 * O par de `salvarRegrasDeConversaoMeta.ts`, com a mesma regra de ouro: a tela
 * manda a lista INTEIRA das etapas abertas, e a regra que some da lista é
 * DESLIGADA, nunca apagada — a linha guarda o `event_name` que o livro-razão já
 * usa para aquela etapa.
 */
import { supportWriteError } from "@/lib/impersonate/support";
import { headers } from "next/headers";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { createAdminClient } from "@/lib/supabase/admin";
import { eventoDaEtapaGa4, VALORES_DE_EVENTO_DE_ETAPA_GA4 } from "@/lib/conversoes/regras-ga4";

export type SalvarRegrasGa4Result =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "etapa_invalida"
        | "erro_ao_gravar";
      details?: unknown;
    };

const regraSchema = z.object({
  stage_id: z.uuid(),
  enabled: z.boolean(),
  ga4_event: z.enum(VALORES_DE_EVENTO_DE_ETAPA_GA4),
});

const entradaSchema = z
  .array(regraSchema)
  .max(200)
  .refine((lista) => new Set(lista.map((r) => r.stage_id)).size === lista.length, {
    message: "Etapa repetida.",
  });

export type RegraDeConversaoGa4Input = z.input<typeof regraSchema>;

export async function salvarRegrasDeConversaoGa4(
  input: RegraDeConversaoGa4Input[],
): Promise<SalvarRegrasGa4Result> {
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
  const regras = parsed.data;

  // Toda etapa ligada precisa ser DESTA organização e não ganha: ganho é a
  // venda (outro consumidor). Perda entra: no GA4 ela é `close_unconvert_lead`.
  const ligadas = regras.filter((r) => r.enabled).map((r) => r.stage_id);
  if (ligadas.length > 0) {
    const { data: etapas, error } = await admin
      .from("crm_stages")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_won", false)
      .in("id", ligadas);
    if (error) return { ok: false, error: "erro_ao_gravar" };
    const validas = new Set(((etapas ?? []) as Array<{ id: string }>).map((e) => e.id));
    if (ligadas.some((id) => !validas.has(id))) return { ok: false, error: "etapa_invalida" };
  }

  const { data: existentes, error: erroLeitura } = await admin
    .from("ga4_conversion_rules")
    .select("stage_id, event_name")
    .eq("organization_id", orgId);
  if (erroLeitura) return { ok: false, error: "erro_ao_gravar" };
  const existentePorEtapa = new Map(
    ((existentes ?? []) as Array<{ stage_id: string; event_name: string }>).map((r) => [
      r.stage_id,
      r,
    ]),
  );

  // Regra desligada que nunca existiu não vira linha: não há nome a preservar.
  const linhas = regras
    .filter((r) => r.enabled || existentePorEtapa.has(r.stage_id))
    .map((r) => ({
      organization_id: orgId,
      stage_id: r.stage_id,
      event_name: existentePorEtapa.get(r.stage_id)?.event_name ?? eventoDaEtapaGa4(r.stage_id),
      ga4_event: r.ga4_event,
      enabled: r.enabled,
      updated_by: authUser.id,
    }));

  if (linhas.length > 0) {
    const { error } = await admin
      .from("ga4_conversion_rules")
      .upsert(linhas, { onConflict: "organization_id,stage_id" });
    if (error) return { ok: false, error: "erro_ao_gravar", details: error.message };
  }

  // O que sumiu da lista é desligado — nunca apagado (ver o cabeçalho).
  const enviadas = new Set(regras.map((r) => r.stage_id));
  const sumidas = [...existentePorEtapa.keys()].filter((id) => !enviadas.has(id));
  if (sumidas.length > 0) {
    const { error } = await admin
      .from("ga4_conversion_rules")
      .update({ enabled: false, updated_by: authUser.id })
      .eq("organization_id", orgId)
      .in("stage_id", sumidas);
    if (error) return { ok: false, error: "erro_ao_gravar", details: error.message };
  }

  const hdrs = await headers();
  await audit({
    action: "ga4_conversion_rules.updated",
    actorUserId: authUser.id,
    organizationId: orgId,
    resourceType: "ga4_conversion_rules",
    resourceId: null,
    requestId: hdrs.get("x-request-id") ?? undefined,
    ip: ipDoCliente(hdrs),
    userAgent: hdrs.get("user-agent") ?? undefined,
    metadata: {
      ligadas: ligadas.length,
      desligadas: regras.length - ligadas.length + sumidas.length,
    },
  });

  revalidatePath("/app/settings/conversoes");
  return { ok: true };
}
