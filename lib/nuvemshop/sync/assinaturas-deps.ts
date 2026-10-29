/**
 * Dependências reais da convergência de assinaturas. Em arquivo à parte de
 * `assinaturas.ts` porque `@/lib/env` valida o ambiente ao ser importado, e o módulo
 * puro tem de carregar nos testes sem `.env`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { NuvemshopApiClient } from "@/lib/nuvemshop/api-client";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Assinaturas, DepsDeAssinaturas } from "./assinaturas";
import { PROVEDOR } from "./constantes";
import { carregarIntegracao } from "./integracao";

export function depsDeAssinaturasReais(admin: SupabaseClient = createAdminClient()): DepsDeAssinaturas {
  return {
    lerAssinaturas: async (orgId) => {
      const { data, error } = await admin
        .from("tenant_integrations")
        .select("webhook_subscriptions")
        .eq("organization_id", orgId)
        .eq("provider", PROVEDOR)
        .maybeSingle();
      if (error) throw new Error(`assinaturas_leitura:${error.code ?? error.message}`);
      return ((data as { webhook_subscriptions: Assinaturas | null } | null)?.webhook_subscriptions) ?? null;
    },
    carregarIntegracao: (orgId) => carregarIntegracao(admin, orgId),
    api: (integ) => new NuvemshopApiClient({ storeId: integ.storeId, accessToken: integ.accessToken }),
    gravarAssinaturas: async (orgId, assinaturas) => {
      const { error } = await admin
        .from("tenant_integrations")
        .update({ webhook_subscriptions: assinaturas })
        .eq("organization_id", orgId)
        .eq("provider", PROVEDOR);
      if (error) throw new Error(`assinaturas_gravacao:${error.code ?? error.message}`);
    },
    baseUrl: () => env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""),
  };
}
