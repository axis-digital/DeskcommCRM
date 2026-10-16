"use server";

/**
 * Liga e desliga "Enviar vendas de contatos sem anúncio nem site" (9002). Sem o opt-in, nenhuma venda sem origem sai.
 * A chave mora em `organizations.settings.conversions.enviar_sem_origem` e é
 * lida por `lib/conversoes/reportar-sem-origem.ts`.
 *
 * ⚠️ SERVICE ROLE COM `organization_id` DE FONTE CONFIÁVEL, como
 * `definirExigenciaDeMfa`: pelo client de sessão, o UPDATE de um admin de
 * tenant em `organizations` casa ZERO linhas e devolve sucesso. O id vem de
 * `resolveActiveOrg`, nunca de argumento.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoEnviarSemOrigem =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "erro_ao_gravar";
    };

export async function definirEnviarSemOrigem(ligar: boolean): Promise<ResultadoEnviarSemOrigem> {
  // Server Action é endpoint público: o tipo do parâmetro não chega ao servidor.
  const entrada = z.boolean().safeParse(ligar);
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  // Mesmo gate da tela e das outras actions de Conversões.
  if (!podeAdministrarEmpresa(user, org)) {
    return { ok: false, error: "forbidden_role" };
  }
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "erro_ao_gravar" };

  // `settings` é jsonb compartilhado: ler, mesclar e gravar preserva o que não é nosso.
  const settings = (atual?.settings ?? {}) as Record<string, unknown>;
  const conversions = (settings.conversions ?? {}) as Record<string, unknown>;
  const novo = { ...settings, conversions: { ...conversions, enviar_sem_origem: entrada.data } };

  const { error } = await admin
    .from("organizations")
    .update({ settings: novo })
    .eq("id", org.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "conversions.enviar_sem_origem_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: { ligado: entrada.data },
  });

  revalidatePath("/app/settings/conversoes");
  return { ok: true };
}
