"use server";

/**
 * "Sincronizar agora": inicia um run manual. Só quem administra a empresa;
 * sessão de suporte somente-leitura é recusada antes do efeito.
 */
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { supportWriteError } from "@/lib/impersonate/support";
import { depsDoCatalogoReais } from "@/lib/nuvemshop/sync/catalogo-deps";
import { depsReais } from "@/lib/nuvemshop/sync/deps";
import { iniciarCatalogo } from "@/lib/nuvemshop/sync/iniciar-catalogo";
import { iniciarSincronizacao, type ResultadoDoInicio } from "@/lib/nuvemshop/sync/iniciar";

export type SyncNowResult =
  | { ok: true }
  | { ok: false; error: "auth_required" | "no_active_org" | "forbidden" | "mfa_required" | Extract<ResultadoDoInicio, { ok: false }>["motivo"] };

export async function syncNuvemshopNow(): Promise<SyncNowResult> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "auth_required" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return { ok: false, error: "no_active_org" };
  if (!podeAdministrarEmpresa(user, activeOrg)) return { ok: false, error: "forbidden" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const r = await iniciarSincronizacao(depsReais(), activeOrg.orgId, "manual");
  // O catálogo anda ao lado dos pedidos e não segura o botão: uma falha dele
  // não vira erro do clique, e "já está sincronizando" é do run de pedidos.
  await iniciarCatalogo(depsDoCatalogoReais(), activeOrg.orgId, "manual").catch(() => undefined);
  if (!r.ok) return { ok: false, error: r.motivo };

  await audit({
    action: "nuvemshop.sync_requested",
    organizationId: activeOrg.orgId,
    actorUserId: user.id,
    metadata: { origem: "manual", run_id: r.runId },
  });
  revalidatePath("/app/integrations/nuvemshop");
  return { ok: true };
}
