"use server";

import { supportWriteError } from "@/lib/impersonate/support";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { VALORES_DE_EVENTO_DE_VENDA_GA4 } from "@/lib/conversoes/regras-ga4";
import { lerCredencialGa4 } from "@/lib/plataformas-de-anuncio/ga4/credencial";
import { validarNoGa4 } from "@/lib/plataformas-de-anuncio/ga4/measurement-protocol";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

type Erro =
  | "validation_failed"
  | "unauthenticated"
  | "forbidden_tenant"
  | "forbidden_role"
  | "mfa_required"
  | "cifra_indisponivel"
  | "erro_ao_gravar";

export type UpdateGa4ConnectionResult =
  { ok: true } | { ok: false; error: Erro; details?: unknown };

const entradaSchema = z.object({
  measurement_id: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^G-[A-Z0-9]{4,16}$/, "formato G-XXXXXXX")),
  api_secret: z.string().trim().min(10).max(200).optional(),
  won_event: z.enum(VALORES_DE_EVENTO_DE_VENDA_GA4),
  enabled: z.boolean(),
});

export type Ga4ConnectionInput = z.input<typeof entradaSchema>;

/** Mesma porta de entrada de toda ação de configuração: suporte, tenant, papel, MFA. */
type Autorizacao =
  | { erro: Erro; authUser?: undefined; orgId?: undefined }
  | { erro?: undefined; authUser: { id: string }; orgId: string };

async function autorizar(): Promise<Autorizacao> {
  const authUser = await loadAuthUser();
  if (!authUser) return { erro: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { erro: "forbidden_role" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { erro: "forbidden_tenant" };
  if (!podeAdministrarEmpresa(authUser, activeOrg)) return { erro: "forbidden_role" };
  if (await mfaEmDivida()) return { erro: "mfa_required" };
  return { authUser, orgId: activeOrg.orgId };
}

export async function updateGa4Connection(
  input: Ga4ConnectionInput,
): Promise<UpdateGa4ConnectionResult> {
  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  const auth = await autorizar();
  if (auth.erro) return { ok: false, error: auth.erro };

  const admin = createAdminClient();
  const valores: Record<string, unknown> = {
    organization_id: auth.orgId,
    platform: "ga4",
    dataset_id: parsed.data.measurement_id,
    ga4_won_event: parsed.data.won_event,
    enabled: parsed.data.enabled,
    updated_by: auth.authUser.id,
  };
  // Sem api_secret na entrada, a coluna cifrada fica como está (não é zerada).
  if (parsed.data.api_secret) {
    const cifrado = await encryptWebhookSecret(admin, parsed.data.api_secret);
    if (!cifrado) return { ok: false, error: "cifra_indisponivel" };
    valores.access_token_encrypted = cifrado;
  }
  const { error } = await admin
    .from("ad_platform_connections")
    .upsert(valores, { onConflict: "organization_id,platform" });
  if (error) return { ok: false, error: "erro_ao_gravar", details: error.message };

  const hdrs = await headers();
  // A auditoria registra QUE o segredo foi trocado, nunca o valor.
  await audit({
    action: "ad_platform_connection.updated",
    actorUserId: auth.authUser.id,
    organizationId: auth.orgId,
    resourceType: "ad_platform_connections",
    resourceId: null,
    requestId: hdrs.get("x-request-id") ?? undefined,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: hdrs.get("user-agent") ?? undefined,
    metadata: {
      platform: "ga4",
      enabled: parsed.data.enabled,
      measurement_id: parsed.data.measurement_id,
      won_event: parsed.data.won_event,
      segredo_trocado: Boolean(parsed.data.api_secret),
    },
  });
  revalidatePath("/app/settings/conversoes");
  return { ok: true };
}

/** "Testar conexão": manda um evento fictício ao /debug/mp/collect, que valida sem registrar. */
export async function testarConexaoGa4(): Promise<
  { ok: true } | { ok: false; error: string; mensagens?: string[] }
> {
  const auth = await autorizar();
  if (auth.erro) return { ok: false, error: auth.erro };
  const admin = createAdminClient();
  const lida = await lerCredencialGa4(admin, auth.orgId);
  if (!lida.ok) return { ok: false, error: lida.motivo };
  const r = await validarNoGa4(lida.credencial, {
    nome: lida.credencial.wonEvent,
    identidade: { clientId: "1234567890.1700000000", sessionId: null },
    ocorridoEm: new Date(),
    valorCentavos: 100,
    moeda: "BRL",
    transactionId: lida.credencial.wonEvent === "purchase" ? "teste-de-conexao" : null,
  });
  return r.ok ? { ok: true } : { ok: false, error: "rejeitado_pelo_ga4", mensagens: r.mensagens };
}
