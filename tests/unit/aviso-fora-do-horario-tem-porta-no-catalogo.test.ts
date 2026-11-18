import { describe, expect, it } from "vitest";

import { NAV_CATALOG } from "@/lib/navigation/catalogo";

/**
 * O aviso de fora do horário (#70) é um bloco no fim da tela "Distribuição de
 * atendimento", sem entrada própria em Configurações. Quem procurava pelo aviso não
 * achava nada: o cartão da tela só falava de distribuição. A descrição do cartão é a
 * porta (é o texto que a lista de Configurações e a busca mostram), então ela precisa
 * nomear o aviso.
 */
describe("aviso de fora do horário: a porta no catálogo de navegação", () => {
  const porta = NAV_CATALOG.find((item) => item.href === "/app/settings/atendimento");

  it("CONTROLE: a tela que abriga o aviso continua no catálogo", () => {
    expect(porta, "a entrada de /app/settings/atendimento sumiu do catálogo").toBeDefined();
  });

  it("a descrição do cartão nomeia o aviso de fora do horário", () => {
    expect(porta?.description).toMatch(/aviso de fora do hor[aá]rio/i);
  });
});
