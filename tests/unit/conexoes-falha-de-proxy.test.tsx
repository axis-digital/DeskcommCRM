/**
 * Central de Conexões — a falha de PROXY diz o que é, e não o que parece.
 *
 * No modo de pool gerenciado, uma sessão que não conseguiu o proxy individual
 * fica `FAILED` com `status_reason = proxy_<codigo>`. Sem este tratamento o
 * cartão mostra só a bolinha vermelha de "falhou" — e quem opera conclui que o
 * número foi desvinculado, a conclusão que a tela de pareamento já ensina. O
 * número está intacto; o que falta é proxy. A mensagem vem da MESMA fonte da
 * resposta da API (`lib/channels/motivo-de-proxy.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type * as CanaisModule from "@/hooks/channels/useChannelSessions";
import type { ChannelSession } from "@/hooks/channels/useChannelSessions";
import { MENSAGEM_DO_PROXY } from "@/lib/channels/motivo-de-proxy";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/channels/usePacingKnobs", () => ({
  usePacingKnobs: () => ({ data: { items: [] } }),
}));
vi.mock("@/components/connections/AntiBanSheet", () => ({ AntiBanSheet: () => null }));

const listagem: {
  data: ChannelSession[] | undefined;
  isLoading: boolean;
  isError: boolean;
  schemaOutdated: boolean;
} = { data: [], isLoading: false, isError: false, schemaOutdated: false };

vi.mock("@/hooks/channels/useChannelSessions", async (original) => {
  const real = await original<typeof CanaisModule>();
  return { ...real, useChannelSessions: () => listagem };
});

import { ConnectionsClient } from "@/components/connections/ConnectionsClient";

function canal(over: Partial<ChannelSession> = {}): ChannelSession {
  return {
    id: "canal-1",
    waha_session_name: "org_1111_aaa",
    display_name: "Vendas",
    phone_number: "5511999999999",
    status: "FAILED",
    status_reason: null,
    last_health_check_at: null,
    last_status_change_at: null,
    daily_message_limit: 250,
    is_warmup_complete: null,
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  listagem.data = [canal()];
  listagem.isLoading = false;
  listagem.isError = false;
  listagem.schemaOutdated = false;
});
afterEach(() => cleanup());

describe("cartão de uma conexão que falhou por proxy", () => {
  it.each(Object.entries(MENSAGEM_DO_PROXY))(
    "proxy_%s mostra a mensagem do código, não só 'Falhou'",
    (codigo, mensagem) => {
      listagem.data = [canal({ status: "FAILED", status_reason: `proxy_${codigo}` })];

      render(wrap(<ConnectionsClient wahaConfigured />));

      expect(screen.getByText(mensagem)).toBeInTheDocument();
    },
  );

  it("sessão parada (STOPPED) pelo reconciliador também explica o proxy", () => {
    listagem.data = [canal({ status: "STOPPED", status_reason: "proxy_incerto" })];

    render(wrap(<ConnectionsClient wahaConfigured />));

    expect(screen.getByText(MENSAGEM_DO_PROXY.incerto)).toBeInTheDocument();
  });

  it("falha por outro motivo NÃO ganha a mensagem de proxy", () => {
    listagem.data = [canal({ status: "FAILED", status_reason: "connection_repair_required" })];

    render(wrap(<ConnectionsClient wahaConfigured />));

    for (const mensagem of Object.values(MENSAGEM_DO_PROXY)) {
      expect(screen.queryByText(mensagem)).not.toBeInTheDocument();
    }
  });

  it("conexão que voltou a funcionar não carrega o aviso de um motivo antigo", () => {
    listagem.data = [canal({ status: "WORKING", status_reason: "proxy_pool_esgotado" })];

    render(wrap(<ConnectionsClient wahaConfigured />));

    expect(screen.queryByText(MENSAGEM_DO_PROXY.pool_esgotado)).not.toBeInTheDocument();
  });

  it("a mensagem é anunciada como estado (leitor de tela), não só pintada", () => {
    listagem.data = [canal({ status: "FAILED", status_reason: "proxy_indisponivel" })];

    render(wrap(<ConnectionsClient wahaConfigured />));

    expect(screen.getByRole("status")).toHaveTextContent(MENSAGEM_DO_PROXY.indisponivel);
  });
});
