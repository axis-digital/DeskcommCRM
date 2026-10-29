/**
 * Varredura dos carrinhos abandonados de uma loja → `site_events`.
 *
 * Não há webhook de carrinho abandonado (não achei na documentação), então o cron
 * de reconciliação consulta a API. Ela só alcança 30 dias para trás e apaga os
 * carrinhos em 90, por isso o fato é guardado aqui. A API não filtra por data, só
 * por `since_id`, e um carrinho pode aparecer até 6 horas depois de abandonado — um
 * cursor por id pularia os atrasados. Então a varredura relê as primeiras páginas e
 * deixa a chave do fato (`dedupe_key`) cuidar de não duplicar; as páginas já
 * gravadas custam uma consulta ao banco, não uma escrita por carrinho.
 */
import { NuvemshopApiError } from "@/lib/nuvemshop/api-client";
import { eventoDeCarrinhoAbandonado } from "../eventos-do-site";
import { depsDosEventosReais, registrarEventoDoSite, type DepsDosEventosDoSite } from "./eventos-do-site.service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export const POR_PAGINA = 200;
/** 5 × 200 = 1.000 carrinhos por rodada: bem acima do que uma loja pequena abandona em 30 dias. */
export const PAGINAS_MAXIMAS = 5;

export interface DepsDosCarrinhos extends DepsDosEventosDoSite {
  chavesJaGravadas(orgId: string, chaves: string[]): Promise<Set<string>>;
}

export interface ResumoDosCarrinhos {
  motivo?: "integracao_inativa" | "desautorizada" | "limite_de_taxa";
  paginas: number;
  lidos: number;
  gravados: number;
  jaGravados: number;
  semContato: number;
  ignorados: number;
  /** Chegou ao teto de páginas com a última cheia: pode haver mais além. */
  truncado: boolean;
}

export function depsDosCarrinhosReais(admin: SupabaseClient = createAdminClient()): DepsDosCarrinhos {
  return {
    ...depsDosEventosReais(admin),
    chavesJaGravadas: async (orgId, chaves) => {
      if (chaves.length === 0) return new Set();
      const { data, error } = await admin
        .from("site_events")
        .select("dedupe_key")
        .eq("organization_id", orgId)
        .in("dedupe_key", chaves);
      if (error) throw new Error(`site_events_leitura:${error.code ?? error.message}`);
      return new Set((data ?? []).map((l) => (l as { dedupe_key: string }).dedupe_key));
    },
  };
}

export async function varrerCarrinhosAbandonados(deps: DepsDosCarrinhos, orgId: string): Promise<ResumoDosCarrinhos> {
  const resumo: ResumoDosCarrinhos = { paginas: 0, lidos: 0, gravados: 0, jaGravados: 0, semContato: 0, ignorados: 0, truncado: false };

  const integ = await deps.carregarIntegracao(orgId);
  if (!integ || integ.status !== "healthy") return { ...resumo, motivo: "integracao_inativa" };
  const api = deps.api(integ);

  for (let page = 1; page <= PAGINAS_MAXIMAS; page++) {
    let itens: unknown[];
    try {
      itens = await api.listAbandonedCheckouts({ page, perPage: POR_PAGINA });
    } catch (err) {
      if (err instanceof NuvemshopApiError && err.status === 429) return { ...resumo, motivo: "limite_de_taxa" };
      if (err instanceof NuvemshopApiError && (err.status === 401 || err.status === 403)) {
        await deps.desautorizar(integ);
        return { ...resumo, motivo: "desautorizada" };
      }
      throw err;
    }
    resumo.paginas++;
    resumo.lidos += itens.length;

    const fatos = itens.map((i) => eventoDeCarrinhoAbandonado(i, deps.agora()));
    const chaves = fatos.flatMap((f) => (f ? [f.evento.dedupe_key] : []));
    const jaTem = await deps.chavesJaGravadas(orgId, chaves);

    for (const fato of fatos) {
      if (!fato) {
        resumo.ignorados++;
        continue;
      }
      if (jaTem.has(fato.evento.dedupe_key)) {
        resumo.jaGravados++;
        continue;
      }
      const r = await registrarEventoDoSite(deps, { orgId, storeId: integ.storeId, customerId: null }, fato);
      if (r === "gravado") resumo.gravados++;
      else if (r === "sem_contato") resumo.semContato++;
    }

    if (itens.length < POR_PAGINA) return resumo;
    if (page === PAGINAS_MAXIMAS) resumo.truncado = true;
  }
  return resumo;
}
