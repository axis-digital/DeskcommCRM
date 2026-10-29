/**
 * `nuvemshop-cliente.v1` — webhook `customer/created` → `GET /customers/{id}` →
 * `site_events` (kind `cadastro`). O webhook só traz o id; o cliente inteiro vem da
 * API. A gravação é idempotente por `dedupe_key` (`cadastro:<id>`), então um aviso
 * repetido ou a reentrega do `event_log` não duplica nada.
 */
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { NuvemshopApiError } from "@/lib/nuvemshop/api-client";
import { eventoDeCadastro } from "../eventos-do-site";
import { tratarErroDaApi } from "./erro-da-api";
import { depsDosEventosReais, registrarEventoDoSite, type DepsDosEventosDoSite } from "./eventos-do-site.service";

const KEY = "nuvemshop-cliente.v1";
const r = (status: HandlerResult["status"], detail: string): HandlerResult => ({ consumer_key: KEY, status, detail });

export async function processarClienteDoWebhook(row: EventRow, deps: DepsDosEventosDoSite): Promise<HandlerResult> {
  const id = row.payload.id;
  if (id === undefined || id === null || String(id) === "") return r("skipped", "sem_id");

  const integ = await deps.carregarIntegracao(row.organization_id);
  if (!integ || integ.status !== "healthy") return r("skipped", "integracao_inativa");

  let bruto: unknown;
  try {
    bruto = await deps.api(integ).getCustomer(String(id));
  } catch (err) {
    if (err instanceof NuvemshopApiError && err.status === 404) return r("skipped", "cliente_inexistente");
    return tratarErroDaApi(err, integ, deps, KEY);
  }

  const resultado = await registrarEventoDoSite(
    deps,
    { orgId: row.organization_id, storeId: integ.storeId, customerId: String(id) },
    eventoDeCadastro(bruto, deps.agora()),
  );
  return resultado === "gravado" ? r("ok", "gravado") : r("skipped", resultado);
}

export const nuvemshopClienteHandler: EventHandler = {
  key: KEY,
  naOrgParada: "pula",
  events: ["nuvemshop.customer_created"],
  handle: (row) => processarClienteDoWebhook(row, depsDosEventosReais()),
};
