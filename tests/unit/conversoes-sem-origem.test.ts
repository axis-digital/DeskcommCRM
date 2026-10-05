import { beforeEach, describe, expect, it, vi } from "vitest";
import { enviarSemOrigemLigado, hashNormalizado } from "@/lib/conversoes/enviar-sem-origem";

describe("fallback offline", () => {
  it("é desligado quando a chave não existe", () => {
    expect(enviarSemOrigemLigado({})).toBe(false);
    expect(enviarSemOrigemLigado(null)).toBe(false);
    expect(enviarSemOrigemLigado({ conversions: { enviar_sem_origem: "true" } })).toBe(false);
  });

  it("liga só com true booleano", () => {
    expect(enviarSemOrigemLigado({ conversions: { enviar_sem_origem: true } })).toBe(true);
  });

  it("o hash normaliza antes de gerar o SHA-256", () => {
    expect(hashNormalizado("  Maria@Exemplo.com ")).toBe(hashNormalizado("maria@exemplo.com"));
  });

  it("gera SHA-256 hexadecimal do valor normalizado", () => {
    expect(hashNormalizado("A")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashNormalizado("A")).toBe(hashNormalizado("a"));
  });
});

// ─── O fluxo por plataforma (mocks do livro-razão, da credencial e do transporte) ───
const ORG = "11111111-1111-1111-1111-111111111111";
const LEAD = "22222222-2222-2222-2222-222222222222";

const mocks = vi.hoisted(() => ({
  registro: null as Record<string, unknown> | null,
  credenciais: {} as Record<string, unknown>,
  resultadoEnviar: { tipo: "ok", detalhe: "aceito" } as Record<string, unknown>,
  enviar: null as unknown,
  gravados: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/conversoes/registro-de-envio", () => ({
  lerRegistro: vi.fn(async () => mocks.registro),
  registraEnvio: vi.fn(async (_a: unknown, r: Record<string, unknown>) => {
    mocks.gravados.push(r);
  }),
}));
vi.mock("@/lib/plataformas-de-anuncio/credenciais", () => ({
  lerCredencial: vi.fn(
    async (_a: unknown, _o: unknown, plataforma: string) =>
      mocks.credenciais[plataforma] ?? { ok: false, motivo: "sem_conexao" },
  ),
}));
vi.mock("@/lib/plataformas-de-anuncio/registry", () => ({
  transporteDe: () => ({
    enviar: (...args: unknown[]) => (mocks.enviar as (...a: unknown[]) => unknown)(...args),
  }),
}));

import { eventoSemOrigem, reportarVendaSemOrigem } from "@/lib/conversoes/reportar-sem-origem";

const venda = {
  organizationId: ORG,
  leadId: LEAD,
  valorCentavos: 15000 as number | null,
  moeda: "BRL",
  ocorridoEm: new Date("2026-10-06T12:00:00Z"),
  telefone: "5511999998888" as string | null,
  email: "maria@exemplo.com" as string | null,
};
const conectada = { ok: true, credencial: {} };

describe("fallback sem origem por plataforma", () => {
  beforeEach(() => {
    mocks.registro = null;
    mocks.credenciais = { meta_ads: conectada, google_ads: conectada };
    mocks.resultadoEnviar = { tipo: "ok", detalhe: "aceito" };
    mocks.enviar = vi.fn(async () => mocks.resultadoEnviar);
    mocks.gravados.length = 0;
  });

  it("a chave do livro-razão é uma por plataforma", () => {
    expect(eventoSemOrigem("meta_ads")).toBe("SemOrigem:meta_ads:Purchase");
    expect(eventoSemOrigem("google_ads")).toBe("SemOrigem:google_ads:Purchase");
  });

  it("envia às duas plataformas ligadas, sem clique, e grava uma linha por plataforma", async () => {
    const desfechos = await reportarVendaSemOrigem(createFakeAdmin(), venda);
    expect(desfechos.map((d) => [d.plataforma, d.status])).toEqual([
      ["meta_ads", "sent"],
      ["google_ads", "sent"],
    ]);
    expect(mocks.gravados.map((g) => [g.plataforma, g.evento, g.status])).toEqual([
      ["meta_ads", "SemOrigem:meta_ads:Purchase", "sent"],
      ["google_ads", "SemOrigem:google_ads:Purchase", "sent"],
    ]);
    const primeiraChamada = (mocks.enviar as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(primeiraChamada).toMatchObject({
      cliqueDeOrigem: "",
      evento: "Purchase",
      telefone: venda.telefone,
      emailDoContato: venda.email,
    });
  });

  it("sem conexão, a plataforma não grava nada: não havia o que reportar", async () => {
    mocks.credenciais = { meta_ads: { ok: false, motivo: "sem_conexao" }, google_ads: conectada };
    const desfechos = await reportarVendaSemOrigem(createFakeAdmin(), venda);
    expect(desfechos[0]).toMatchObject({
      plataforma: "meta_ads",
      status: "skipped",
      motivo: "sem_conexao",
    });
    expect(mocks.gravados.map((g) => g.plataforma)).toEqual(["google_ads"]);
  });

  it("já enviada não manda de novo", async () => {
    mocks.registro = { status: "sent" };
    const desfechos = await reportarVendaSemOrigem(createFakeAdmin(), venda);
    expect(desfechos.every((d) => d.motivo === "ja_enviada")).toBe(true);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("Meta sem valor registra sem_valor e não envia", async () => {
    const desfechos = await reportarVendaSemOrigem(createFakeAdmin(), {
      ...venda,
      valorCentavos: null,
    });
    expect(desfechos.find((d) => d.plataforma === "meta_ads")).toMatchObject({
      motivo: "sem_valor",
    });
    expect(mocks.gravados.find((g) => g.plataforma === "meta_ads")).toMatchObject({
      status: "skipped",
      motivo: "sem_valor",
    });
  });

  it("sem telefone nem e-mail registra sem_identificador", async () => {
    const desfechos = await reportarVendaSemOrigem(createFakeAdmin(), {
      ...venda,
      telefone: null,
      email: null,
    });
    expect(desfechos.every((d) => d.motivo === "sem_identificador")).toBe(true);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("transitório pede nova tentativa, sem marcar como enviada", async () => {
    mocks.resultadoEnviar = { tipo: "transitorio", detalhe: "503" };
    const desfechos = await reportarVendaSemOrigem(createFakeAdmin(), venda);
    expect(desfechos.every((d) => d.status === "retry")).toBe(true);
    expect(mocks.gravados.every((g) => g.status === "skipped")).toBe(true);
  });

  it("evento de teste não conta como venda real", async () => {
    mocks.credenciais = {
      meta_ads: { ok: true, credencial: { testEventCode: "TEST1" } },
      google_ads: { ok: false, motivo: "sem_conexao" },
    };
    const desfechos = await reportarVendaSemOrigem(createFakeAdmin(), venda);
    expect(desfechos[0]).toMatchObject({ plataforma: "meta_ads", motivo: "evento_de_teste" });
  });
});

/** Admin fake: o fluxo só o usa pelo `lerRegistro`, que está mockado. */
function createFakeAdmin() {
  return {} as never;
}
