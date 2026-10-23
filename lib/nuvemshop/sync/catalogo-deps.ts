/**
 * O que os handlers do catálogo precisam do mundo. Interface para os testes
 * trocarem banco e rede por dublês; `depsDoCatalogoReais()` liga ao Supabase e
 * à API. Separada de `DepsDoSync`: o catálogo não tem run, trava nem cursor
 * próprio (o cursor é o `max(last_updated_at)` do próprio espelho).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { NuvemshopApiClient } from "@/lib/nuvemshop/api-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVENTO_CATALOG_PAGE, type PassoDoCatalogo } from "./constantes";
import { marcarIntegracaoDesautorizada } from "./desautorizada";
import { apagarProduto, gravarProduto, type ResultadoDaGravacaoDeProduto } from "./gravar-produto";
import { carregarIntegracao, type IntegracaoCarregada } from "./integracao";

export interface ApiDeProdutos {
  listProducts: NuvemshopApiClient["listProducts"];
  getProduct: NuvemshopApiClient["getProduct"];
}

export interface DepsDoCatalogo {
  carregarIntegracao(orgId: string): Promise<IntegracaoCarregada | null>;
  api(integ: IntegracaoCarregada): ApiDeProdutos;
  gravarProduto(orgId: string, bruto: unknown): Promise<ResultadoDaGravacaoDeProduto>;
  apagarProduto(orgId: string, externalId: string): Promise<void>;
  /** O produto mais novo já espelhado: de onde a reconciliação continua. */
  cursorDoCatalogo(orgId: string): Promise<string | null>;
  /** Já há página do catálogo na fila ou em curso (evita varreduras em dobro). */
  catalogoEmAndamento(orgId: string): Promise<boolean>;
  emitirPagina(orgId: string, integracaoId: string, passo: PassoDoCatalogo): Promise<void>;
  desautorizar(integ: IntegracaoCarregada): Promise<void>;
  auditar(entry: Parameters<typeof audit>[0]): Promise<void>;
  agora(): Date;
}

export function depsDoCatalogoReais(admin: SupabaseClient = createAdminClient()): DepsDoCatalogo {
  return {
    carregarIntegracao: (orgId) => carregarIntegracao(admin, orgId),
    api: (integ) => new NuvemshopApiClient({ storeId: integ.storeId, accessToken: integ.accessToken }),
    gravarProduto: (orgId, bruto) => gravarProduto(admin, { orgId }, bruto),
    apagarProduto: (orgId, externalId) => apagarProduto(admin, { orgId }, externalId),
    cursorDoCatalogo: async (orgId) => {
      const { data, error } = await admin
        .from("nuvemshop_products")
        .select("last_updated_at")
        .eq("organization_id", orgId)
        .order("last_updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`catalogo_cursor:${error.message}`);
      return (data as { last_updated_at?: string } | null)?.last_updated_at ?? null;
    },
    catalogoEmAndamento: async (orgId) => {
      const { count, error } = await admin
        .from("event_log")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("event_type", EVENTO_CATALOG_PAGE)
        .in("status", ["pending", "processing"]);
      if (error) throw new Error(`catalogo_em_andamento:${error.message}`);
      return (count ?? 0) > 0;
    },
    emitirPagina: async (orgId, integracaoId, passo) => {
      const { error } = await admin.rpc("emit_event", {
        p_event_type: EVENTO_CATALOG_PAGE,
        p_entity_kind: "tenant_integration",
        p_entity_id: integracaoId,
        p_payload: passo as unknown as Record<string, unknown>,
        p_metadata: { pagina: passo.pagina },
        p_organization_id: orgId,
      });
      if (error) throw new Error(`emit_${EVENTO_CATALOG_PAGE}:${error.message}`);
    },
    desautorizar: (integ) => marcarIntegracaoDesautorizada(admin, integ),
    auditar: (entry) => audit(entry),
    agora: () => new Date(),
  };
}
