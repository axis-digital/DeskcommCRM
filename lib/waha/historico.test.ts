/**
 * Importação do histórico (fork Axis) — o que se prende aqui:
 *   - a mensagem do GOWS (formato medido em produção, 2026-10-02) vira a MESMA
 *     identidade e o MESMO `external_id` que o webhook gravaria;
 *   - a rodada respeita a janela de dias, pula grupo e não morre por um chat;
 *   - as rodadas param quando o celular termina de entregar;
 *   - só o pareamento (QR → WORKING) dispara, e só com a feature ligada.
 * O lado do banco (gatilhos silenciados) é `tests/invariants/importacao-de-historico-wa-nao-dispara-efeitos.test.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WahaPayload } from "./envelope";
import {
  diasDeHistoricoDoAmbiente,
  importarEmRodadas,
  importarHistoricoDaSessao,
  paraLinhaDeHistorico,
  registrarStatusParaHistorico,
  type LinhaDeHistorico,
} from "./historico";

const LID = "107563345567837";
const CHAT_DA_LISTA = "558587813683@c.us";
const AGORA = new Date("2026-10-02T16:00:00Z");
const TS = Math.floor(Date.parse("2026-10-01T12:00:00Z") / 1000);

function gowsInbound(over: Partial<WahaPayload> = {}): WahaPayload {
  return {
    id: `false_${LID}@lid_3A110EB7F31A739DA715`,
    timestamp: TS,
    from: `${LID}@lid`,
    fromMe: false,
    body: "Chegando",
    to: null,
    hasMedia: false,
    media: null,
    ack: 2,
    _data: { Info: { PushName: "Esposa" }, Message: { conversation: "Chegando" } },
    ...over,
  } as WahaPayload;
}

function gowsOutbound(over: Partial<WahaPayload> = {}): WahaPayload {
  return gowsInbound({
    id: `true_${LID}@lid_3A1DB91B7554F20CC3FD`,
    fromMe: true,
    body: "Tô no polo da parangaba",
    _data: { Info: { PushName: "Davi Guerreiro" }, Message: { extendedTextMessage: { text: "x" } } },
    ...over,
  } as Partial<WahaPayload>);
}

describe("paraLinhaDeHistorico — mesma identidade do webhook", () => {
  it("inbound GOWS: lid da mensagem + telefone da lista, id completo, nome do PushName", () => {
    expect(paraLinhaDeHistorico(gowsInbound(), CHAT_DA_LISTA)).toMatchObject({
      chat_id: `${LID}@lid`,
      kind: "lid",
      lid: LID,
      phone: "+5585987813683",
      notify: "Esposa",
      external_id: `false_${LID}@lid_3A110EB7F31A739DA715`,
      direction: "inbound",
      type: "text",
      body: "Chegando",
      sent_at: "2026-10-01T12:00:00.000Z",
      preview: "Chegando",
    });
  });

  it("outbound (fromMe): chat pelo id, external_id BARE e nunca o nome do operador", () => {
    const linha = paraLinhaDeHistorico(gowsOutbound(), CHAT_DA_LISTA) as LinhaDeHistorico;
    expect(linha.direction).toBe("outbound");
    expect(linha.external_id).toBe("3A1DB91B7554F20CC3FD");
    expect(linha.chat_id).toBe(`${LID}@lid`);
    expect(linha.notify).toBeNull();
  });

  it("foto sem legenda do GOWS vira image com preview, não texto vazio", () => {
    const linha = paraLinhaDeHistorico(
      gowsInbound({ body: null, hasMedia: true, _data: { Message: { imageMessage: {} } } } as Partial<WahaPayload>),
      CHAT_DA_LISTA,
    );
    expect(linha).toMatchObject({ type: "image", body: null, preview: "[image]" });
  });

  it("descarta grupo, evento vazio e mensagem sem id ou sem data", () => {
    expect(paraLinhaDeHistorico(gowsInbound({ from: "120363000000000000@g.us" }), "120363000000000000@g.us")).toBeNull();
    expect(paraLinhaDeHistorico(gowsInbound({ body: null, _data: {} } as Partial<WahaPayload>), CHAT_DA_LISTA)).toBeNull();
    expect(paraLinhaDeHistorico(gowsInbound({ id: null } as Partial<WahaPayload>), CHAT_DA_LISTA)).toBeNull();
    expect(paraLinhaDeHistorico(gowsInbound({ timestamp: null } as Partial<WahaPayload>), CHAT_DA_LISTA)).toBeNull();
  });

  it("chat por telefone: o número vem do próprio chatId", () => {
    const linha = paraLinhaDeHistorico(
      gowsInbound({ from: "558599990000@c.us", id: "false_558599990000@c.us_ABC" }),
      "558599990000@c.us",
    );
    expect(linha).toMatchObject({ kind: "phone", phone: "+5585999990000", lid: null });
  });
});

function adminFalso(resposta: (linhas: LinhaDeHistorico[]) => unknown = (l) => ({ inseridas: l.length, duplicadas: 0, ignoradas: 0 })) {
  const lotes: LinhaDeHistorico[][] = [];
  const admin = {
    rpc: vi.fn(async (nome: string, args: { p_mensagens: LinhaDeHistorico[] }) => {
      expect(nome).toBe("fn_importar_historico_wa");
      lotes.push(args.p_mensagens);
      return { data: resposta(args.p_mensagens), error: null };
    }),
  } as unknown as SupabaseClient;
  return { admin, lotes };
}

const sessao = { id: "s-1", organization_id: "o-1", waha_session_name: "org_x" };
const DIA = 86_400;
const agoraS = Math.floor(AGORA.getTime() / 1000);

describe("importarHistoricoDaSessao — uma rodada", () => {
  it("percorre só a janela, pula grupo, conta o chat que falhou e grava em lote", async () => {
    const chats = [
      { chatId: CHAT_DA_LISTA, ultimaEm: agoraS - DIA },
      { chatId: "120363000000000000@g.us", ultimaEm: agoraS - 2 * DIA },
      { chatId: "558511112222@c.us", ultimaEm: agoraS - 3 * DIA },
      { chatId: "558533334444@c.us", ultimaEm: agoraS - 40 * DIA },
    ];
    const client = {
      listarChats: vi.fn(async (_s: string, p: { offset: number }) => (p.offset === 0 ? chats : [])),
      listarMensagensDoChat: vi.fn(async (_s: string, chatId: string, p: { desde: number }) => {
        expect(p.desde).toBe(agoraS - 30 * DIA);
        if (chatId === "558511112222@c.us") throw new Error("waha_chat_messages_500");
        return [gowsInbound(), gowsOutbound(), { id: 123 }];
      }),
    };
    const { admin, lotes } = adminFalso();

    const r = await importarHistoricoDaSessao({ admin, client }, sessao, { dias: 30, agora: AGORA });

    expect(client.listarMensagensDoChat.mock.calls.map((c) => c[1])).toEqual([CHAT_DA_LISTA, "558511112222@c.us"]);
    expect(r).toEqual({ chats: 2, mensagensLidas: 3, inseridas: 2, duplicadas: 0, ignoradas: 0, falhas: 1 });
    expect(lotes).toHaveLength(1);
    expect(lotes[0]!.map((l) => l.direction)).toEqual(["inbound", "outbound"]);
  });

  it("erro do BANCO aborta a rodada (é sistêmico, não de um chat)", async () => {
    const client = {
      listarChats: vi.fn(async () => [{ chatId: CHAT_DA_LISTA, ultimaEm: agoraS }]),
      listarMensagensDoChat: vi.fn(async () => [gowsInbound()]),
    };
    const admin = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "historico_sessao_fora_da_org" } })),
    } as unknown as SupabaseClient;
    await expect(importarHistoricoDaSessao({ admin, client }, sessao, { dias: 30, agora: AGORA })).rejects.toThrow(
      /historico_lote/,
    );
  });
});

describe("importarEmRodadas", () => {
  it("para depois de duas rodadas seguidas sem nada novo", async () => {
    let chamada = 0;
    const client = {
      listarChats: vi.fn(async (_s: string, p: { offset: number }) =>
        p.offset === 0 ? [{ chatId: CHAT_DA_LISTA, ultimaEm: null }] : [],
      ),
      listarMensagensDoChat: vi.fn(async () => [gowsInbound()]),
    };
    const inseridasPorRodada = [1, 3, 0, 0, 5];
    const { admin } = adminFalso(() => ({ inseridas: inseridasPorRodada[chamada++] ?? 0, duplicadas: 0, ignoradas: 0 }));
    const esperas: number[] = [];

    const r = await importarEmRodadas(
      { admin, client, esperar: async (ms) => void esperas.push(ms) },
      sessao,
      365,
      { primeiraEsperaMs: 10, intervaloMs: 20, maxRodadas: 12, rodadasQuietasParaParar: 2 },
    );

    expect(r).toEqual({ rodadas: 4, inseridas: 4 });
    expect(esperas).toEqual([10, 20, 20, 20]);
  });
});

describe("disparo e configuração", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("WAHA_HISTORY_IMPORT_DAYS: só inteiro positivo liga, com teto", () => {
    expect(diasDeHistoricoDoAmbiente("365")).toBe(365);
    expect(diasDeHistoricoDoAmbiente("")).toBe(0);
    expect(diasDeHistoricoDoAmbiente("0")).toBe(0);
    expect(diasDeHistoricoDoAmbiente("-5")).toBe(0);
    expect(diasDeHistoricoDoAmbiente("abc")).toBe(0);
    expect(diasDeHistoricoDoAmbiente("1.5")).toBe(0);
    expect(diasDeHistoricoDoAmbiente("99999")).toBe(3650);
  });

  it("WORKING sem QR antes (restart) não dispara", () => {
    const { admin } = adminFalso();
    expect(registrarStatusParaHistorico(admin, { ...sessao, id: "restart" }, "WORKING")).toBe(false);
  });

  it("QR → WORKING com a feature desligada não dispara", () => {
    vi.stubEnv("WAHA_HISTORY_IMPORT_DAYS", "0");
    const { admin } = adminFalso();
    registrarStatusParaHistorico(admin, { ...sessao, id: "desligada" }, "SCAN_QR_CODE", 1_000);
    expect(registrarStatusParaHistorico(admin, { ...sessao, id: "desligada" }, "WORKING", 2_000)).toBe(false);
  });

  it("QR visto há mais de 30 min não conta como pareamento", () => {
    vi.stubEnv("WAHA_HISTORY_IMPORT_DAYS", "365");
    vi.stubEnv("WAHA_API_BASE_URL", "http://wa-ha:3000");
    vi.stubEnv("WAHA_API_KEY", "k");
    const { admin } = adminFalso();
    registrarStatusParaHistorico(admin, { ...sessao, id: "velho" }, "SCAN_QR_CODE", 0);
    expect(registrarStatusParaHistorico(admin, { ...sessao, id: "velho" }, "WORKING", 31 * 60_000)).toBe(false);
  });
});
