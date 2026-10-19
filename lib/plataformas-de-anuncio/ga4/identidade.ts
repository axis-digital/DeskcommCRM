/**
 * A identidade do visitante no GA4 — o que liga um evento do CRM à sessão do
 * site no relatório.
 *
 * O GA4 não aceita evento sem `client_id`, e um `client_id` inventado gera
 * evento órfão (conta no total, não atribui a nada). Por isso o CRM só envia
 * quando CAPTUROU o do visitante, e este módulo é o único que sabe onde ele
 * mora no contato:
 *   - caminho do site / ref da Meta: chaves planas `ga_client_id`/`ga_session_id`
 *     em `source_metadata` (achatadas por `estamparOrigemDaPagina`);
 *   - caminho do Google: `source_metadata.ad_raw.ga`, gravado pela atribuição.
 */
const RE_CLIENT_ID = /^\d{1,12}\.\d{1,12}$/;
const RE_SESSION_ID = /^\d{1,20}$/;

export interface IdentidadeGa4 {
  clientId: string;
  sessionId: string | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

export function normalizarIdentidadeGa4(carga: Record<string, unknown>): IdentidadeGa4 | null {
  const clientId = texto(carga.ga_client_id);
  if (!clientId || !RE_CLIENT_ID.test(clientId)) return null;
  const sessao = texto(carga.ga_session_id);
  return { clientId, sessionId: sessao && RE_SESSION_ID.test(sessao) ? sessao : null };
}

export function lerIdentidadeGa4(sourceMetadata: unknown): IdentidadeGa4 | null {
  const meta = objeto(sourceMetadata);
  if (!meta) return null;
  const plana = normalizarIdentidadeGa4(meta);
  if (plana) return plana;
  const doGoogle = objeto(objeto(meta.ad_raw)?.ga);
  return doGoogle ? normalizarIdentidadeGa4(doGoogle) : null;
}
