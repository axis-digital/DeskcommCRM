import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardData } from "@/lib/kanban/types";

/**
 * FECHAR O DOSSIÊ VOLTA AO FUNIL EM QUE A PESSOA ESTAVA.
 *
 * O dossiê agora tem a conversa dentro: quem responde por ele muda a prévia e o
 * contador do card, então fechar precisa atualizar o quadro. E o deep link
 * (`?lead=`) que abriu o painel não pode sobrar na URL — senão recarregar a
 * página reabriria um dossiê que a pessoa acabou de fechar. O resto da query
 * string (filtros) fica como estava.
 */
vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/kanban/StageColumn", () => ({ StageColumn: () => null }));
vi.mock("@/components/kanban/LeadDossier", () => ({
  LeadDossier: (p: { lead: { id: string }; onOpenChange: (v: boolean) => void }) => (
    <button type="button" data-testid={`dossie-${p.lead.id}`} onClick={() => p.onOpenChange(false)}>
      fechar
    </button>
  ),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/hooks/leads/useAtRiskLeads", () => ({ useAtRiskLeads: () => ({ data: null }) }));
vi.mock("@/hooks/leads/useReactivations", () => ({ useReactivations: () => ({ data: [] }) }));
vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: () => ({ status: "SUBSCRIBED", ultimaEntrega: null }),
}));
vi.mock("@/hooks/realtime/useRefetchDeSeguranca", () => ({ useRefetchDeSeguranca: () => undefined }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(() => new Promise<never>(() => {})), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { KanbanBoard } from "@/components/kanban/KanbanBoard";

const quadro = {
  pipeline: { id: "p-1", name: "Origem", settings: null },
  stages: [{ id: "s-1", name: "Novo", position: 0, is_won: false, is_lost: false, is_archived: false }],
  leads: [
    { id: "l-0", title: "Primeiro", stage_id: "s-1", position_in_stage: 1000 },
    { id: "l-1", title: "Segundo", stage_id: "s-1", position_in_stage: 2000 },
  ],
} as unknown as BoardData;

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidar = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <KanbanBoard
        pipelineId="p-1"
        pipeline={quadro.pipeline}
        stages={quadro.stages}
        leads={quadro.leads}
        leadInicial="l-1"
      />
    </QueryClientProvider>,
  );
  return { invalidar };
}

describe("fechar o dossiê do negócio", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("atualiza o quadro, para o card refletir a resposta enviada pelo dossiê", () => {
    window.history.replaceState(null, "", "/app/pipelines/p-1?lead=l-1");
    const { invalidar } = montar();

    fireEvent.click(screen.getByTestId("dossie-l-1"));

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["board", "p-1"] });
    expect(screen.queryByTestId("dossie-l-1")).toBeNull();
  });

  it("tira o ?lead= da URL e preserva os filtros", () => {
    window.history.replaceState(null, "", "/app/pipelines/p-1?lead=l-1&q=maria");
    montar();

    fireEvent.click(screen.getByTestId("dossie-l-1"));

    expect(window.location.pathname).toBe("/app/pipelines/p-1");
    expect(window.location.search).toBe("?q=maria");
  });

  it("sem ?lead= na URL, não mexe no endereço", () => {
    window.history.replaceState(null, "", "/app/pipelines/p-1?q=maria");
    montar();

    fireEvent.click(screen.getByTestId("dossie-l-1"));

    expect(window.location.search).toBe("?q=maria");
  });
});
