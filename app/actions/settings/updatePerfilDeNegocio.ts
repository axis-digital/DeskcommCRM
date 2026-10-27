"use server";

/**
 * Edita o PERFIL DO NEGÓCIO (canais de venda + objetivos) em Configurações ›
 * Organização — o mesmo par que as boas-vindas perguntam no onboarding.
 *
 * Mora em `organizations.settings.perfil_de_negocio`; schema central em
 * `lib/onboarding/perfil-de-negocio.ts`. `settings` é jsonb COMPARTILHADO
 * (branding, política de MFA, conversões): ler, mesclar e gravar — nunca
 * sobrescrever o objeto inteiro.
 *
 * ⚠️ SERVICE ROLE COM `organization_id` DE FONTE CONFIÁVEL, como
 * `updateTenant`: pelo client de sessão o UPDATE de um admin de tenant em
 * `organizations` casa ZERO linhas e devolve sucesso (issue #144). O id vem de
 * `resolveActiveOrg`, nunca do corpo.
 */
import { headers } from "next/headers";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { supportWriteError } from "@/lib/impersonate/support";
import { perfilDeNegocioSchema } from "@/lib/onboarding/perfil-de-negocio";
import { createAdminClient } from "@/lib/supabase/admin";

export type UpdatePerfilDeNegocioResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "erro_ao_gravar";
      details?: unknown;
    };

export interface PerfilDeNegocioInput {
  canais: string[];
  objetivos: string[];
}

export async function updatePerfilDeNegocio(
  input: PerfilDeNegocioInput,
): Promise<UpdatePerfilDeNegocioResult> {
  // Server Action é endpoint público: o tipo do parâmetro não chega ao servidor.
  // O schema descarta chave desconhecida (ex.: `organization_id` no corpo).
  const parsed = perfilDeNegocioSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  // Guarda de EFEITO do acompanhamento, antes do service role.
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!podeAdministrarEmpresa(authUser, activeOrg)) {
    return { ok: false, error: "forbidden_role" };
  }
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "erro_ao_gravar" };

  const bruto = (atual as { settings?: unknown } | null)?.settings;
  const settings =
    bruto && typeof bruto === "object" && !Array.isArray(bruto)
      ? (bruto as Record<string, unknown>)
      : {};
  const novo = { ...settings, perfil_de_negocio: parsed.data };

  const { error } = await admin
    .from("organizations")
    .update({ settings: novo })
    .eq("id", activeOrg.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  const hdrs = await headers();
  await audit({
    action: "organization.business_profile_updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    requestId: hdrs.get("x-request-id"),
    ip: ipDoCliente(hdrs),
    userAgent: hdrs.get("user-agent"),
    // Vocabulário fechado — nada de texto livre na trilha append-only.
    metadata: { canais: parsed.data.canais, objetivos: parsed.data.objetivos },
  });

  revalidatePath("/app/settings/tenant");
  return { ok: true };
}
