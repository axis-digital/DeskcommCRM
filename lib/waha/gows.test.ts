import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import type { WahaPayload } from "@/lib/waha/envelope";
import { bodyOf, notifyNameOf, resolveMessageType, telefoneAlternativoDe } from "@/lib/waha/ingest";

// Formas medidas em 2026-10-05 na instância Axis (WAHA GOWS), com dados trocados.
const recebidaGows = (over: Record<string, unknown> = {}): WahaPayload =>
  ({
    id: "false_9620760322253@lid_AC333EEF52EBE29A",
    from: "9620760322253@lid",
    fromMe: false,
    to: null,
    hasMedia: false,
    body: "oi",
    _data: {
      Info: {
        Chat: "9620760322253@lid",
        Sender: "9620760322253@lid",
        IsFromMe: false,
        IsGroup: false,
        SenderAlt: "558588777000@s.whatsapp.net",
        RecipientAlt: "",
        PushName: "Cliente Teste",
      },
      Message: { conversation: "oi" },
    },
    ...over,
  }) as unknown as WahaPayload;

const enviadaPeloCelularGows = (): WahaPayload =>
  ({
    id: "true_9620760322253@lid_3EB0F287045C8F0E7DDE86",
    from: "9620760322253@lid",
    fromMe: true,
    to: null,
    body: "resposta do celular",
    _data: {
      Info: {
        Chat: "9620760322253@lid",
        Sender: "56861155942484:15@lid",
        IsFromMe: true,
        IsGroup: false,
        SenderAlt: "",
        RecipientAlt: "558588777000@s.whatsapp.net",
        PushName: "Operador",
      },
      Message: { conversation: "resposta do celular" },
    },
  }) as unknown as WahaPayload;

describe("telefoneAlternativoDe — GOWS", () => {
  it("recebida: telefone sai de Info.SenderAlt", () => {
    expect(telefoneAlternativoDe(recebidaGows())).toBe("+558588777000");
  });

  it("enviada pelo celular: telefone sai de Info.RecipientAlt, nunca do operador", () => {
    expect(telefoneAlternativoDe(enviadaPeloCelularGows())).toBe("+558588777000");
  });

  it("grupo GOWS não empresta o telefone de quem escreveu ao chat", () => {
    const p = recebidaGows({
      from: "120363000000000000@g.us",
      _data: { Info: { IsGroup: true, IsFromMe: false, SenderAlt: "558588777000@s.whatsapp.net" } },
    });
    expect(telefoneAlternativoDe(p)).toBeNull();
  });

  it("ignora dispositivo colado ao número (`:12`)", () => {
    const p = recebidaGows({
      _data: { Info: { IsFromMe: false, SenderAlt: "558588777000:12@s.whatsapp.net" } },
    });
    expect(telefoneAlternativoDe(p)).toBe("+558588777000");
  });

  it("NOWEB continua vindo de _data.key.remoteJidAlt", () => {
    const p = {
      id: "false_1@lid_X",
      from: "1@lid",
      _data: { key: { remoteJidAlt: "5511900000001@s.whatsapp.net" } },
    } as unknown as WahaPayload;
    expect(telefoneAlternativoDe(p)).toBe("+5511900000001");
  });

  it("Alt que não é telefone (lid) é recusado", () => {
    const p = recebidaGows({ _data: { Info: { IsFromMe: false, SenderAlt: "123@lid" } } });
    expect(telefoneAlternativoDe(p)).toBeNull();
  });

  // SenderAlt numa mensagem que saiu do celular é o número do OPERADOR: gravá-lo
  // no contato do cliente funde o cliente na loja. Na dúvida sobre a direção,
  // nenhum telefone.
  it("fromMe sem Info.IsFromMe: usa RecipientAlt, nunca SenderAlt", () => {
    const p = recebidaGows({
      fromMe: true,
      _data: {
        Info: {
          SenderAlt: "558588999999@s.whatsapp.net",
          RecipientAlt: "558588777000@s.whatsapp.net",
        },
      },
    });
    expect(telefoneAlternativoDe(p)).toBe("+558588777000");
  });

  it("fromMe e Info.IsFromMe discordam: nenhum telefone", () => {
    const p = recebidaGows({
      fromMe: true,
      _data: { Info: { IsFromMe: false, SenderAlt: "558588999999@s.whatsapp.net" } },
    });
    expect(telefoneAlternativoDe(p)).toBeNull();
  });

  it("direção desconhecida (sem fromMe nem IsFromMe): nenhum telefone", () => {
    const p = recebidaGows({
      fromMe: undefined,
      _data: { Info: { SenderAlt: "558588999999@s.whatsapp.net" } },
    });
    expect(telefoneAlternativoDe(p)).toBeNull();
  });
});

describe("notifyNameOf — GOWS", () => {
  it("lê Info.PushName quando não há notifyName/pushName", () => {
    expect(notifyNameOf(recebidaGows())).toBe("Cliente Teste");
  });

  it("NOWEB segue preferindo _data.notifyName", () => {
    const p = { _data: { notifyName: "Nome NOWEB" } } as unknown as WahaPayload;
    expect(notifyNameOf(p)).toBe("Nome NOWEB");
  });
});

describe("bodyOf — conteúdo sem `body`", () => {
  it("template de empresa (GOWS): texto de Format.InteractiveMessageTemplate.body.text", () => {
    const p = recebidaGows({
      body: null,
      _data: {
        Info: { IsFromMe: false },
        Message: {
          templateMessage: {
            Format: {
              InteractiveMessageTemplate: {
                body: { text: "O relatório da sua campanha já está disponível." },
                NativeFlowMessage: { buttons: [{ name: "cta_url", buttonParamsJSON: "{}" }] },
              },
            },
            templateID: "1275327015657066",
          },
        },
      },
    });
    expect(bodyOf(p)).toBe("O relatório da sua campanha já está disponível.");
    expect(resolveMessageType(p)).toBe("text");
  });

  it("template hidratado (NOWEB): hydratedTemplate.hydratedContentText", () => {
    const p = {
      body: "",
      _data: {
        message: {
          templateMessage: { hydratedTemplate: { hydratedContentText: "Seu pedido saiu" } },
        },
      },
    } as unknown as WahaPayload;
    expect(bodyOf(p)).toBe("Seu pedido saiu");
  });

  it("GOWS com `_data.Message` maiúsculo: extendedTextMessage.text", () => {
    const p = recebidaGows({
      body: null,
      _data: { Message: { extendedTextMessage: { text: "mensagem recebida" } } },
    });
    expect(bodyOf(p)).toBe("mensagem recebida");
    expect(resolveMessageType(p)).toBe("text");
  });

  it("cartão de contato GOWS sem body vira o vcard", () => {
    const p = recebidaGows({
      body: null,
      _data: {
        Message: { contactMessage: { displayName: "Fulano", vcard: "BEGIN:VCARD\nEND:VCARD" } },
      },
    });
    expect(bodyOf(p)).toBe("BEGIN:VCARD\nEND:VCARD");
    expect(resolveMessageType(p)).toBe("contact");
  });

  it("mídia GOWS sem `type` nem `hasMedia` é reconhecida pelo conteúdo", () => {
    const p = recebidaGows({ body: null, _data: { Message: { imageMessage: {} } } });
    expect(resolveMessageType(p)).toBe("image");
  });

  it("não inventa corpo a partir de campo técnico qualquer", () => {
    const p = recebidaGows({
      body: null,
      _data: {
        Message: { messageContextInfo: { deviceListMetadataVersion: 2 }, senderKeyHash: "abc" },
      },
    });
    expect(bodyOf(p)).toBeNull();
  });
});
