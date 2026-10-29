/**
 * Convergência das assinaturas de webhook de uma loja JÁ conectada.
 *
 * As assinaturas só eram registradas no callback do OAuth. Um evento novo na lista
 * (`customer/created`) nunca chegaria a uma loja conectada antes dele sem reconectar
 * — e reconectar exige o dono da loja. Este módulo compara o que está registrado com
 * `SUBSCRIBED_EVENTS` e cria só o que falta; o cron de reconciliação o chama a cada
 * 30 minutos, e quando nada falta não faz nenhuma chamada à Nuvemshop.
 */
import { eventToSlug, SUBSCRIBED_EVENTS, type NuvemshopEvent } from "@/lib/nuvemshop/config";
import type { NuvemshopWebhook } from "@/lib/nuvemshop/api-client";
import type { IntegracaoCarregada } from "./integracao";

export type Assinaturas = Record<string, { id: number | null; error?: string }>;

export interface ApiDeAssinaturas {
  listWebhooks(): Promise<NuvemshopWebhook[]>;
  createWebhook(event: NuvemshopEvent, url: string): Promise<NuvemshopWebhook>;
}

/** Faltando = nunca registrada OU a tentativa anterior falhou (id nulo). */
export function eventosSemAssinatura(atual: Assinaturas | null | undefined): NuvemshopEvent[] {
  return SUBSCRIBED_EVENTS.filter((e) => atual?.[e]?.id === undefined || atual?.[e]?.id === null);
}

function urlDoEvento(baseUrl: string, evento: NuvemshopEvent): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/v1/webhooks/nuvemshop/${eventToSlug(evento)}`;
}

export async function convergirAssinaturas(args: {
  api: ApiDeAssinaturas;
  baseUrl: string;
  atual: Assinaturas | null;
}): Promise<{ assinaturas: Assinaturas; criadas: NuvemshopEvent[]; falhas: NuvemshopEvent[] }> {
  const faltando = eventosSemAssinatura(args.atual);
  const assinaturas: Assinaturas = { ...(args.atual ?? {}) };
  if (faltando.length === 0) return { assinaturas, criadas: [], falhas: [] };

  const naLoja = await args.api.listWebhooks();
  const criadas: NuvemshopEvent[] = [];
  const falhas: NuvemshopEvent[] = [];

  for (const evento of faltando) {
    const url = urlDoEvento(args.baseUrl, evento);
    // Já existe na loja com este evento e esta URL (registro anterior que não
    // chegou a ser anotado): adota em vez de criar um segundo, que entregaria o
    // mesmo aviso duas vezes.
    const existente = naLoja.find((w) => w.event === evento && w.url === url);
    if (existente) {
      assinaturas[evento] = { id: existente.id ?? null };
      continue;
    }
    try {
      const criado = await args.api.createWebhook(evento, url);
      assinaturas[evento] = { id: criado.id ?? null };
      criadas.push(evento);
    } catch (err) {
      assinaturas[evento] = { id: null, error: err instanceof Error ? err.message : "unknown_error" };
      falhas.push(evento);
    }
  }
  return { assinaturas, criadas, falhas };
}

export interface DepsDeAssinaturas {
  lerAssinaturas(orgId: string): Promise<Assinaturas | null>;
  carregarIntegracao(orgId: string): Promise<IntegracaoCarregada | null>;
  api(integ: IntegracaoCarregada): ApiDeAssinaturas;
  gravarAssinaturas(orgId: string, assinaturas: Assinaturas): Promise<void>;
  baseUrl(): string;
}

/** O passo do cron: barato quando nada falta, e nunca lança por causa da loja. */
export async function convergirAssinaturasDaLoja(
  deps: DepsDeAssinaturas,
  orgId: string,
): Promise<{ criadas: number; falhas: number }> {
  const atual = await deps.lerAssinaturas(orgId);
  if (eventosSemAssinatura(atual).length === 0) return { criadas: 0, falhas: 0 };

  const baseUrl = deps.baseUrl();
  if (!baseUrl) return { criadas: 0, falhas: 0 };
  const integ = await deps.carregarIntegracao(orgId);
  if (!integ || integ.status !== "healthy") return { criadas: 0, falhas: 0 };

  const r = await convergirAssinaturas({ api: deps.api(integ), baseUrl, atual });
  await deps.gravarAssinaturas(orgId, r.assinaturas);
  return { criadas: r.criadas.length, falhas: r.falhas.length };
}
