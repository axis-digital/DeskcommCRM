/**
 * Do fato da loja ao `site_events`: o que o webhook de cadastro e o cron do
 * carrinho abandonado têm em comum.
 *
 * Interface de dependências (como `DepsDoSync`) para os testes trocarem banco e
 * rede por dublês; `depsDosEventosReais()` liga ao Supabase e à API. Fica à parte
 * de `DepsDoSync` de propósito: acrescentar membros ali quebraria os dublês de
 * todos os handlers de pedido que já existem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { NuvemshopApiClient } from "@/lib/nuvemshop/api-client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventoComChaves, EventoDoSite } from "../eventos-do-site";
import { resolverContatoDoPedido, type ChavesDoContato } from "./contato-do-pedido";
import { marcarIntegracaoDesautorizada } from "./desautorizada";
import { carregarIntegracao, type IntegracaoCarregada } from "./integracao";

export interface ApiDeEventosDoSite {
  getCustomer: NuvemshopApiClient["getCustomer"];
  listAbandonedCheckouts: NuvemshopApiClient["listAbandonedCheckouts"];
}

export interface ContextoDoEvento {
  orgId: string;
  storeId: string;
  customerId: string | null;
}

export interface DepsDosEventosDoSite {
  carregarIntegracao(orgId: string): Promise<IntegracaoCarregada | null>;
  api(integ: IntegracaoCarregada): ApiDeEventosDoSite;
  resolverContato(ctx: ContextoDoEvento, chaves: ChavesDoContato): Promise<string | null>;
  gravarEvento(orgId: string, evento: EventoDoSite, contatoId: string | null): Promise<string | null>;
  desautorizar(integ: IntegracaoCarregada): Promise<void>;
  agora(): Date;
}

export function depsDosEventosReais(admin: SupabaseClient = createAdminClient()): DepsDosEventosDoSite {
  return {
    carregarIntegracao: (orgId) => carregarIntegracao(admin, orgId),
    api: (integ) => new NuvemshopApiClient({ storeId: integ.storeId, accessToken: integ.accessToken }),
    resolverContato: (ctx, chaves) => resolverContatoDoPedido(admin, ctx, chaves),
    gravarEvento: async (orgId, evento, contatoId) => {
      const { data, error } = await admin.rpc("fn_gravar_evento_do_site", {
        p_organization_id: orgId,
        p_evento: { ...evento, contact_id: contatoId },
      });
      if (error) throw new Error(`evento_do_site_nao_gravado:${error.code ?? error.message}`);
      return (data as string | null) ?? null;
    },
    desautorizar: (integ) => marcarIntegracaoDesautorizada(admin, integ),
    agora: () => new Date(),
  };
}

export type ResultadoDoRegistro = "gravado" | "sem_fato" | "sem_contato";

/**
 * Liga o fato ao contato e grava. Sem contato, NADA é gravado: nesta etapa o
 * evento só existe para quem a loja identificou (e-mail, telefone ou CPF), e
 * inventar alguém seria pior que omitir. O visitante anônimo é outra etapa, com
 * a própria base legal e prazo de descarte.
 */
export async function registrarEventoDoSite(
  deps: Pick<DepsDosEventosDoSite, "resolverContato" | "gravarEvento">,
  ctx: ContextoDoEvento,
  fato: EventoComChaves | null,
): Promise<ResultadoDoRegistro> {
  if (!fato) return "sem_fato";
  const contatoId = await deps.resolverContato(ctx, fato.chaves);
  if (!contatoId) return "sem_contato";
  await deps.gravarEvento(ctx.orgId, fato.evento, contatoId);
  return "gravado";
}
