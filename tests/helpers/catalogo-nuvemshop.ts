/** Dublês compartilhados pelos testes do catálogo. */
import { vi } from "vitest";
import type { EventRow } from "@/lib/event-log/dispatcher";
import type { DepsDoCatalogo } from "@/lib/nuvemshop/sync/catalogo-deps";

export const INTEG = { id: "integ-1", organizationId: "org-1", status: "healthy", storeId: "s1", accessToken: "t" };

export const linhaDeEvento = (event_type: string, payload: Record<string, unknown>): EventRow => ({
  id: "ev", organization_id: "org-1", event_type, entity_kind: "tenant_integration",
  entity_id: null, payload, metadata: {}, consumed_by: [], attempts: 0,
});

export function depsDoCatalogo(over: Partial<DepsDoCatalogo> = {}): DepsDoCatalogo {
  return {
    carregarIntegracao: vi.fn().mockResolvedValue(INTEG),
    api: vi.fn(() => ({ listProducts: vi.fn().mockResolvedValue([]), getProduct: vi.fn() })) as unknown as DepsDoCatalogo["api"],
    gravarProduto: vi.fn().mockResolvedValue({ ok: true }),
    apagarProduto: vi.fn().mockResolvedValue(undefined),
    cursorDoCatalogo: vi.fn().mockResolvedValue(null),
    catalogoEmAndamento: vi.fn().mockResolvedValue(false),
    emitirPagina: vi.fn().mockResolvedValue(undefined),
    desautorizar: vi.fn().mockResolvedValue(undefined),
    auditar: vi.fn().mockResolvedValue(undefined),
    agora: () => new Date("2026-10-23T12:00:00Z"),
    ...over,
  };
}
