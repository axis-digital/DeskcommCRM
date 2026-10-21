import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assinarConvite,
  conviteDispensado,
  conviteDispensadoNoServidor,
  deveConvidarParaNotificacoes,
  dispensarConvite,
} from "./convite";

describe("deveConvidarParaNotificacoes", () => {
  const base = { permission: "default" as const, pushDeMensagemLigado: true, dispensado: false };

  it("convida quando o navegador ainda não perguntou", () => {
    expect(deveConvidarParaNotificacoes(base)).toBe(true);
  });

  it("não convida quem já concedeu", () => {
    expect(deveConvidarParaNotificacoes({ ...base, permission: "granted" })).toBe(false);
  });

  it("não convida quem negou — um clique não desfaz o bloqueio do navegador", () => {
    expect(deveConvidarParaNotificacoes({ ...base, permission: "denied" })).toBe(false);
  });

  it("não convida em navegador sem a API (e no servidor)", () => {
    expect(deveConvidarParaNotificacoes({ ...base, permission: "unsupported" })).toBe(false);
  });

  it("não convida quem desligou o push de mensagem em Configurações", () => {
    expect(deveConvidarParaNotificacoes({ ...base, pushDeMensagemLigado: false })).toBe(false);
  });

  it("não convida quem dispensou a faixa", () => {
    expect(deveConvidarParaNotificacoes({ ...base, dispensado: true })).toBe(false);
  });
});

describe("dispensa do convite", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("começa não dispensado e fica dispensado depois de dispensar, avisando quem assina", () => {
    const ouvinte = vi.fn();
    const sair = assinarConvite(ouvinte);
    expect(conviteDispensado()).toBe(false);

    dispensarConvite();

    expect(conviteDispensado()).toBe(true);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    sair();
  });

  it("no servidor conta como dispensado, para o HTML nunca nascer com a faixa", () => {
    expect(conviteDispensadoNoServidor()).toBe(true);
  });
});
