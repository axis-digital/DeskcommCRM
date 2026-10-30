import { describe, expect, it, vi } from "vitest";

import { SUBSCRIBED_EVENTS } from "@/lib/nuvemshop/config";
import {
  convergirAssinaturas,
  convergirAssinaturasDaLoja,
  eventosSemAssinatura,
  type Assinaturas,
  type DepsDeAssinaturas,
} from "./assinaturas";

const BASE = "https://crm.exemplo.com.br";
const todas = (): Assinaturas => Object.fromEntries(SUBSCRIBED_EVENTS.map((e, i) => [e, { id: 100 + i }]));

describe("eventosSemAssinatura", () => {
  it("sem nada registrado, faltam todos", () => {
    expect(eventosSemAssinatura(null)).toEqual([...SUBSCRIBED_EVENTS]);
  });

  it("loja conectada antes do evento novo: falta só ele", () => {
    const antes = todas();
    delete antes["customer/created"];
    expect(eventosSemAssinatura(antes)).toEqual(["customer/created"]);
  });

  it("assinatura que falhou (id nulo) conta como faltando, para tentar de novo", () => {
    const a = todas();
    a["order/paid"] = { id: null, error: "boom" };
    expect(eventosSemAssinatura(a)).toEqual(["order/paid"]);
  });

  it("tudo assinado: nada falta", () => {
    expect(eventosSemAssinatura(todas())).toEqual([]);
  });
});

describe("convergirAssinaturas", () => {
  it("cria só o que falta, apontando para a rota certa do evento", async () => {
    const createWebhook = vi.fn().mockResolvedValue({ id: 999, event: "customer/created", url: "x" });
    const atual = todas();
    delete atual["customer/created"];

    const r = await convergirAssinaturas({
      api: { listWebhooks: vi.fn().mockResolvedValue([]), createWebhook },
      baseUrl: BASE,
      atual,
    });

    expect(createWebhook).toHaveBeenCalledTimes(1);
    expect(createWebhook).toHaveBeenCalledWith("customer/created", `${BASE}/api/v1/webhooks/nuvemshop/customer-created`);
    expect(r.criadas).toEqual(["customer/created"]);
    expect(r.assinaturas["customer/created"]).toEqual({ id: 999 });
  });

  it("preserva as assinaturas que já existiam", async () => {
    const atual = todas();
    delete atual["customer/created"];
    const r = await convergirAssinaturas({
      api: { listWebhooks: vi.fn().mockResolvedValue([]), createWebhook: vi.fn().mockResolvedValue({ id: 5 }) },
      baseUrl: BASE,
      atual,
    });
    expect(r.assinaturas["order/created"]).toEqual(atual["order/created"]);
  });

  it("adota o webhook que já existe na loja com o mesmo evento e a mesma URL, sem criar outro", async () => {
    const createWebhook = vi.fn();
    const r = await convergirAssinaturas({
      api: {
        listWebhooks: vi.fn().mockResolvedValue([
          { id: 321, event: "customer/created", url: `${BASE}/api/v1/webhooks/nuvemshop/customer-created` },
        ]),
        createWebhook,
      },
      baseUrl: BASE,
      atual: null,
    });
    expect(r.assinaturas["customer/created"]).toEqual({ id: 321 });
    expect(createWebhook).not.toHaveBeenCalledWith("customer/created", expect.anything());
  });

  it("falha ao criar uma assinatura não derruba as outras: fica registrada com o erro", async () => {
    const createWebhook = vi.fn(async (evento: string) => {
      if (evento === "order/paid") throw new Error("422 já existe");
      return { id: 7, event: evento, url: "x" };
    });
    const r = await convergirAssinaturas({
      api: { listWebhooks: vi.fn().mockResolvedValue([]), createWebhook },
      baseUrl: BASE,
      atual: null,
    });
    expect(r.assinaturas["order/paid"]).toEqual({ id: null, error: "422 já existe" });
    expect(r.assinaturas["order/created"]).toEqual({ id: 7 });
    expect(r.falhas).toEqual(["order/paid"]);
  });

  it("tira a barra final da URL base", async () => {
    const createWebhook = vi.fn().mockResolvedValue({ id: 1, event: "e", url: "u" });
    await convergirAssinaturas({
      api: { listWebhooks: vi.fn().mockResolvedValue([]), createWebhook },
      baseUrl: `${BASE}/`,
      atual: null,
    });
    expect(createWebhook).toHaveBeenCalledWith("order/created", `${BASE}/api/v1/webhooks/nuvemshop/order-created`);
  });
});

describe("convergirAssinaturasDaLoja", () => {
  const INTEG = { id: "i1", organizationId: "org-1", status: "healthy", storeId: "s1", accessToken: "t" };
  function deps(atual: Assinaturas | null, over: Partial<DepsDeAssinaturas> = {}): DepsDeAssinaturas {
    return {
      lerAssinaturas: vi.fn().mockResolvedValue(atual),
      carregarIntegracao: vi.fn().mockResolvedValue(INTEG),
      api: vi.fn(() => ({
        listWebhooks: vi.fn().mockResolvedValue([]),
        createWebhook: vi.fn().mockResolvedValue({ id: 55, event: "e", url: "u" }),
      })) as unknown as DepsDeAssinaturas["api"],
      gravarAssinaturas: vi.fn().mockResolvedValue(undefined),
      baseUrl: () => BASE,
      ...over,
    };
  }

  it("loja com tudo assinado: não chama a API da Nuvemshop nem grava nada", async () => {
    const d = deps(todas());
    const r = await convergirAssinaturasDaLoja(d, "org-1");
    expect(r).toEqual({ criadas: 0, falhas: 0 });
    expect(d.carregarIntegracao).not.toHaveBeenCalled();
    expect(d.gravarAssinaturas).not.toHaveBeenCalled();
  });

  it("loja conectada antes do evento novo: cria a assinatura e grava o mapa completo", async () => {
    const atual = todas();
    delete atual["customer/created"];
    const d = deps(atual);
    const r = await convergirAssinaturasDaLoja(d, "org-1");
    expect(r).toEqual({ criadas: 1, falhas: 0 });
    expect(d.gravarAssinaturas).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ "customer/created": { id: 55 }, "order/created": atual["order/created"] }),
    );
  });

  it("integração que não está saudável não é tocada", async () => {
    const d = deps(null, { carregarIntegracao: vi.fn().mockResolvedValue({ ...INTEG, status: "disconnected" }) });
    expect(await convergirAssinaturasDaLoja(d, "org-1")).toEqual({ criadas: 0, falhas: 0 });
    expect(d.gravarAssinaturas).not.toHaveBeenCalled();
  });

  it("sem URL base conhecida, não inventa destino de webhook", async () => {
    const d = deps(null, { baseUrl: () => "" });
    expect(await convergirAssinaturasDaLoja(d, "org-1")).toEqual({ criadas: 0, falhas: 0 });
    expect(d.gravarAssinaturas).not.toHaveBeenCalled();
  });
});
