import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRow } from "@/lib/event-log/dispatcher";

let atual: Record<string, unknown>;
let liberarConsulta: () => void;
let consultaPendente: Promise<void>;
const removeMock = vi.fn();

interface Atualizacao {
  eq(coluna: string, valor: unknown): Atualizacao;
  filter(coluna: string, operador: string, valor: unknown): Atualizacao;
  is(coluna: string, valor: unknown): Atualizacao;
  select(colunas: string): Promise<{ data: { id: string }[]; error: null }>;
}

function atualizar(patch: Record<string, unknown>): Atualizacao {
  const filtros: Array<[string, string, unknown]> = [];
  const cadeia: Atualizacao = {
    eq: (c, v) => {
      filtros.push([c, "eq", v]);
      return cadeia;
    },
    filter: (c, op, v) => {
      filtros.push([c, op, v]);
      return cadeia;
    },
    is: (c, v) => {
      filtros.push([c, "is", v]);
      return cadeia;
    },
    select: async () => {
      const casa = filtros.every(([coluna, op, valor]) => {
        const [nome, chave] = coluna.split("->>");
        const campo = nome ? atual[nome] : null;
        const dado = chave
          ? ((campo as Record<string, unknown> | null)?.[chave] ?? null)
          : (campo ?? null);
        if (op === "eq" || op === "is") return dado === valor;
        if (op === "isdistinct") return dado !== valor;
        throw new Error(`Filtro sem emulação: ${op}`);
      });
      if (casa) Object.assign(atual, structuredClone(patch));
      return { data: casa ? [{ id: "msg1" }] : [], error: null };
    },
  };
  return cadeia;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      select: () => {
        const cadeia = {
          eq: (_coluna: string, _valor: unknown) => cadeia,
          maybeSingle: async () => {
            if (tabela === "conversations") {
              await consultaPendente;
              return { data: { is_group: false, comando_da_conversa: "humano" }, error: null };
            }
            if (tabela === "channel_sessions") return { data: { provider: "teste" }, error: null };
            return { data: structuredClone(atual), error: null };
          },
        };
        return cadeia;
      },
      update: atualizar,
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: removeMock }) },
  }),
}));
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS: "session_ref",
  DEFAULT_CHANNEL_PROVIDER: "teste",
  resolveSessionRef: () => "sessao-de-teste",
  getAdapter: () => ({
    fetchInboundMedia: async () => ({ buffer: Buffer.from("audio-sintetico"), mime: "audio/ogg" }),
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { persistMessageMedia } from "@/workers/media-persist-worker";

const evento: EventRow = {
  id: "ev1",
  organization_id: "org1",
  entity_kind: "message",
  entity_id: "msg1",
  event_type: "media.persist_requested",
  payload: { message_id: "msg1" },
  metadata: {},
  attempts: 0,
  consumed_by: [],
};

beforeEach(() => {
  atual = {
    id: "msg1",
    organization_id: "org1",
    conversation_id: "conv1",
    channel_session_id: "s1",
    type: "audio",
    body: null,
    media_url: "http://origem-de-teste/audio",
    media_mime: "audio/ogg",
    media_storage_path: null,
    media_derived_status: null,
    metadata: {},
  };
  consultaPendente = new Promise<void>((resolve) => {
    liberarConsulta = resolve;
  });
  removeMock.mockReset();
});

describe("persistência concorrente com transcrição pedida pelo atendente", () => {
  it.each([null, "ready", "failed"])(
    "preserva o pedido manual quando a leitura concorrente está %s",
    async (status) => {
      const persistindo = persistMessageMedia(evento);
      await vi.waitFor(() => expect(atual.media_storage_path).toBeTruthy());
      atual.media_derived_status = status;
      atual.media_derived_text = status === "ready" ? "Transcrição sintética concluída" : null;
      atual.metadata = {
        media_status: "stored",
        transcricao_solicitada_em: "2026-11-26T15:00:00Z",
        media_derived_motivo: "motivo atual",
      };
      liberarConsulta();
      expect((await persistindo).status).toBe("ok");
      expect(atual.media_derived_status).toBe(status);
      expect(atual.metadata).toMatchObject({
        transcricao_solicitada_em: "2026-11-26T15:00:00Z",
        media_derived_motivo: "motivo atual",
      });
      expect(removeMock).not.toHaveBeenCalled();
    },
  );

  it("sem clique, grava o estado terminal que não faz o agente esperar", async () => {
    liberarConsulta();
    await persistMessageMedia(evento);
    expect(atual.media_derived_status).toBe("skipped");
    expect(atual.metadata).toMatchObject({ transcricao_sob_demanda: true });
  });
});
