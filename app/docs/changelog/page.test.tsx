import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PERIODOS } from "@/lib/docs/changelog";

const idiomaDoTeste = vi.hoisted(() => ({ atual: "pt-BR" as "pt-BR" | "es" }));

vi.mock("@/lib/branding/saida", () => ({
  marcaDaSaida: async () => ({ nome: "Marca da Revenda" }),
}));
vi.mock("@/lib/i18n/idiomaAnonimo", () => ({
  idiomaDoVisitante: async () => idiomaDoTeste.atual,
}));

import ChangelogPage, { metadata } from "./page";

describe("/docs/changelog", () => {
  beforeEach(() => {
    idiomaDoTeste.atual = "pt-BR";
  });

  it("quem escolheu espanhol lê a abertura e os rótulos em espanhol", async () => {
    idiomaDoTeste.atual = "es";
    const { container } = render(await ChangelogPage());
    const texto = container.textContent ?? "";
    expect(texto).toContain("Novedades, correcciones y ajustes de interfaz");
    expect(container.querySelector('[data-tipo="novo"]')?.textContent).toBe("Nuevo");
    expect(container.querySelector('[data-tipo="corrigido"]')?.textContent).toBe("Corregido");
  });

  it("tem título de aba próprio", () => {
    expect(metadata.title).toBe("Changelog");
  });

  it("mostra o nome da marca resolvido no servidor, nunca um nome fixo", async () => {
    const { container } = render(await ChangelogPage());
    expect(container.textContent).toContain("Marca da Revenda");
  });

  it("um heading por período, com a âncora do id", async () => {
    const { container } = render(await ChangelogPage());
    for (const periodo of PERIODOS) {
      const secao = container.querySelector(`section#${periodo.id}`);
      expect(secao, `sem seção para ${periodo.id}`).not.toBeNull();
      expect(secao?.querySelector("h2")?.textContent).toContain(periodo.titulo);
    }
  });

  it("renderiza todas as mudanças, cada uma com o rótulo do seu tipo", async () => {
    const { container } = render(await ChangelogPage());
    const itens = container.querySelectorAll("li");
    const esperado = PERIODOS.reduce((soma, p) => soma + p.mudancas.length, 0);
    expect(itens.length).toBe(esperado);

    const primeiro = PERIODOS[0]?.mudancas[0];
    if (!primeiro) throw new Error("o changelog não tem nenhuma mudança para conferir");
    expect(container.textContent).toContain(primeiro.texto);
    expect(itens.item(0).querySelector("[data-tipo]")?.getAttribute("data-tipo")).toBe(
      primeiro.tipo,
    );
  });

  it("não tem link para o GitHub nem número de PR", async () => {
    const { container } = render(await ChangelogPage());
    expect(container.innerHTML).not.toMatch(/github\.com/i);
    expect(container.textContent).not.toMatch(/#\d+/);
  });
});
