/**
 * A origem do contato a partir da `landing_url` dos pedidos da loja.
 *
 * O sync já grava a `landing_url` de cada pedido (em `orders.payload`), e até aqui
 * ela só ficava ali. Quando a página de entrada traz UTM ou click id (`fbclid`,
 * `gclid`), é a origem da compra — e é a que o contato precisa carregar.
 *
 * Esta varredura roda no cron de reconciliação e carimba o contato pela regra que
 * JÁ EXISTE (`estamparOrigemDaPagina` → `fn_estampar_atribuicao_de_anuncio`): o
 * primeiro toque é decidido pelo banco, aqui não há regra de atribuição paralela.
 *
 * ─── Por que uma varredura e não o `gravarPedido` ───────────────────────────────
 * O sync percorre janelas de `updated_at` sem ordem garantida. Carimbar no ato de
 * gravar daria ao contato a origem do pedido que chegou primeiro, e não a do mais
 * antigo. Aqui, depois de gravados, o pedido mais antigo com marcador de cada
 * contato é quem decide — e a mesma varredura cobre os pedidos já sincronizados.
 *
 * ─── Dois cuidados que não são óbvios ───────────────────────────────────────────
 * 1. `landing_url` é URL de VISITANTE. Só UTM e click ids passam; `ga_client_id` e
 *    `ga_session_id` ficam de fora, senão um link montado à mão forjaria a
 *    identidade do GA4 que o contato guarda.
 * 2. O `source` do contato NUNCA muda. O LGPD localiza o contato da loja por
 *    `source = 'nuvemshop'` (redact e cópia do titular); a função do banco grava
 *    `source = p_platform`, então o `source` que o contato já tem é repassado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHAVES_DE_UTM, estamparOrigemDaPagina, normalizarUtm } from "@/lib/leads/origem-do-site";
import { createAdminClient } from "@/lib/supabase/admin";

import { PROVEDOR } from "./constantes";

/** Pedidos lidos por rodada. A rodada seguinte continua de onde esta parou (o contato carimbado sai do filtro). */
export const LIMITE_DE_PEDIDOS_POR_RODADA = 500;

/** Por onde a origem foi lida; vai em `source_metadata.origem_via`. */
export const VIA_DO_PEDIDO = "pedido_nuvemshop";

/** `source` de contato que veio da loja, quando o contato não tem nenhum. */
const FONTE_PADRAO = PROVEDOR;

/** UTM e click ids; a identidade do GA4 (`ga_*`) não viaja por URL de visitante. */
const CHAVES_DA_LANDING_URL: ReadonlySet<string> = new Set(CHAVES_DE_UTM.filter((c) => !c.startsWith("ga_")));

export interface PedidoComOrigem {
  contactId: string;
  /** O `source` que o contato tem hoje. */
  source: string | null;
  orderedAt: string;
  landingUrl: string;
}

export interface DepsDaOrigemDosPedidos {
  /** Pedidos da organização com marcador na `landing_url`, de contatos SEM origem, do mais antigo ao mais novo. */
  candidatos(orgId: string, limite: number): Promise<PedidoComOrigem[]>;
  /** `false` quando o banco recusou (o contato já tinha origem). */
  estampar(
    orgId: string,
    contactId: string,
    origem: { utm: Record<string, string>; capturadaEm: string; fonte: string },
  ): Promise<boolean>;
}

export interface ResumoDaOrigemDosPedidos {
  lidos: number;
  carimbados: number;
  /** Tinha marcador na URL, mas nenhuma chave válida depois de normalizar. */
  semOrigem: number;
  falhas: number;
  /** Leu o teto: pode haver mais além. */
  truncado: boolean;
}

/** UTM e click ids da URL de entrada. Nunca lança: URL ilegível é "sem origem". */
export function utmDaLandingUrl(url: string | null | undefined): Record<string, string> {
  if (!url || !url.trim()) return {};
  let consulta: URLSearchParams;
  try {
    // A base só existe para a URL relativa ("/colecao?utm_source=x") não lançar.
    consulta = new URL(url.trim(), "https://loja.invalid").searchParams;
  } catch {
    return {};
  }
  const bruto: Record<string, string> = {};
  for (const [chave, valor] of consulta) {
    const k = chave.trim().toLowerCase();
    if (!CHAVES_DA_LANDING_URL.has(k) || k in bruto) continue; // chave repetida: vale a primeira
    bruto[k] = valor;
  }
  return normalizarUtm(bruto);
}

export async function carimbarOrigemDosPedidos(
  deps: DepsDaOrigemDosPedidos,
  orgId: string,
): Promise<ResumoDaOrigemDosPedidos> {
  const resumo: ResumoDaOrigemDosPedidos = { lidos: 0, carimbados: 0, semOrigem: 0, falhas: 0, truncado: false };

  const pedidos = await deps.candidatos(orgId, LIMITE_DE_PEDIDOS_POR_RODADA);
  resumo.lidos = pedidos.length;
  resumo.truncado = pedidos.length >= LIMITE_DE_PEDIDOS_POR_RODADA;

  // Do mais antigo ao mais novo, por contato: o primeiro com marcador válido é o primeiro toque.
  const ordenados = [...pedidos].sort((a, b) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt));
  const decididos = new Set<string>();
  const semMarcadorValido = new Set<string>();
  for (const p of ordenados) {
    if (decididos.has(p.contactId)) continue;
    const utm = utmDaLandingUrl(p.landingUrl);
    if (Object.keys(utm).length === 0) {
      semMarcadorValido.add(p.contactId);
      continue;
    }
    decididos.add(p.contactId);
    semMarcadorValido.delete(p.contactId);
    try {
      const gravou = await deps.estampar(orgId, p.contactId, {
        utm,
        capturadaEm: p.orderedAt,
        fonte: p.source || FONTE_PADRAO,
      });
      if (gravou) resumo.carimbados++;
      else resumo.falhas++;
    } catch {
      resumo.falhas++;
    }
  }
  resumo.semOrigem = semMarcadorValido.size;
  return resumo;
}

/** Pedido com marcador na URL, de contato que ainda não tem origem: o filtro é do SQL. */
const MARCADORES_NA_URL = ["*utm_*=*", "*fbclid=*", "*gclid=*"];

export function depsDaOrigemDosPedidosReais(admin: SupabaseClient = createAdminClient()): DepsDaOrigemDosPedidos {
  return {
    candidatos: async (orgId, limite) => {
      const { data, error } = await admin
        .from("orders")
        .select("contact_id, ordered_at, payload, contacts!inner(source)")
        .eq("organization_id", orgId)
        .eq("external_provider", PROVEDOR)
        .eq("is_anonymized", false)
        .not("contact_id", "is", null)
        // O contato que já tem origem sai do lote NO SQL: filtrar depois deixaria os
        // já carimbados ocupando as primeiras vagas para sempre.
        .is("contacts.source_metadata->>ad_platform", null)
        .or(MARCADORES_NA_URL.map((m) => `payload->>landing_url.ilike.${m}`).join(","))
        .order("ordered_at", { ascending: true })
        .limit(limite);
      if (error) throw new Error(`orders_leitura:${error.code ?? error.message}`);

      return (data ?? []).flatMap((linha) => {
        const l = linha as unknown as {
          contact_id: string | null;
          ordered_at: string;
          payload: { landing_url?: unknown } | null;
          contacts: { source: string | null } | Array<{ source: string | null }> | null;
        };
        const url = l.payload?.landing_url;
        const contato = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts;
        if (!l.contact_id || typeof url !== "string") return [];
        return [{ contactId: l.contact_id, source: contato?.source ?? null, orderedAt: l.ordered_at, landingUrl: url }];
      });
    },
    estampar: (orgId, contactId, origem) =>
      estamparOrigemDaPagina(
        admin as unknown as Parameters<typeof estamparOrigemDaPagina>[0],
        orgId,
        contactId,
        { utm: origem.utm, capturadaEm: origem.capturadaEm },
        { fonte: origem.fonte, via: VIA_DO_PEDIDO },
      ),
  };
}
