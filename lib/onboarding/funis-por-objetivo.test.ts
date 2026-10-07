/**
 * Os funis extras do passo "funil" — um por objetivo marcado além do primeiro.
 *
 * Puro: o que se decide aqui é QUAIS funis nascem, com que nome, slug, posição
 * e etapas. Quem grava é `app/actions/onboarding/montarQuadro.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  contextoDoPerfil,
  extrasMarcados,
  objetivosExtras,
  planoDosFunisExtras,
  type FunilExistente,
} from "@/lib/onboarding/funis-por-objetivo";
import { pacoteDoObjetivo } from "@/lib/onboarding/perfil-de-negocio";

const PADRAO: FunilExistente = {
  id: "p1",
  name: "Agendamentos",
  slug: "agendamentos",
  position: 1000,
  is_archived: false,
  settings: { objetivo: "agendar", fields: [] },
};

describe("objetivosExtras", () => {
  it("sem perfil não há extra nenhum", () => {
    expect(objetivosExtras(null)).toEqual([]);
  });

  it("o primeiro objetivo é do funil padrão; os seguintes viram extras, até 3 funis no total", () => {
    expect(
      objetivosExtras({
        canais: [],
        objetivos: ["agendar", "vender_produto", "captar_lead", "vender_servico"],
      }),
    ).toEqual(["vender_produto", "captar_lead"]);
  });

  it("um objetivo só não gera extra", () => {
    expect(objetivosExtras({ canais: ["whatsapp"], objetivos: ["vender_servico"] })).toEqual([]);
  });
});

describe("extrasMarcados", () => {
  const perfil = { canais: [], objetivos: ["agendar", "vender_produto", "captar_lead"] as const };

  it("só aceita objetivos que o perfil oferece como extra — o corpo não inventa funil", () => {
    expect(
      extrasMarcados(["vender_produto", "agendar", "vender_servico", "lixo"], {
        canais: [],
        objetivos: [...perfil.objetivos],
      }),
    ).toEqual(["vender_produto"]);
  });

  it("entrada que não é lista vira nenhum extra", () => {
    expect(
      extrasMarcados("vender_produto", { canais: [], objetivos: [...perfil.objetivos] }),
    ).toEqual([]);
    expect(extrasMarcados(null, { canais: [], objetivos: [...perfil.objetivos] })).toEqual([]);
  });

  it("sem perfil nada é marcado", () => {
    expect(extrasMarcados(["vender_produto"], null)).toEqual([]);
  });
});

describe("planoDosFunisExtras", () => {
  it("cria um funil por objetivo marcado a partir do pacote, com etapas, passo e settings.objetivo", () => {
    const plano = planoDosFunisExtras(["vender_produto", "captar_lead"], [PADRAO]);
    expect(plano).toHaveLength(2);

    const [produto, lead] = plano;
    const pacote = pacoteDoObjetivo("vender_produto");
    expect(produto!.objetivo).toBe("vender_produto");
    expect(produto!.nome).toBe(pacote.proposta.nome);
    expect(produto!.settings).toEqual({ objetivo: "vender_produto" });
    expect(produto!.etapas.map((e) => e.agent_stage_hint)).toEqual(
      pacote.proposta.etapas.map((e) => e.passo),
    );
    expect(produto!.etapas.filter((e) => e.is_won)).toHaveLength(1);
    expect(produto!.etapas.filter((e) => e.is_lost)).toHaveLength(1);
    expect(lead!.objetivo).toBe("captar_lead");

    // No fim da lista, em ordem, sem colidir com o que existe.
    expect(produto!.position).toBeGreaterThan(PADRAO.position);
    expect(lead!.position).toBeGreaterThan(produto!.position);
  });

  it("não duplica: objetivo que já tem funil ativo fica de fora", () => {
    const existente: FunilExistente = {
      id: "p2",
      name: "Vendas",
      slug: "vendas",
      position: 2000,
      is_archived: false,
      settings: { objetivo: "vender_produto" },
    };
    const plano = planoDosFunisExtras(["vender_produto", "captar_lead"], [PADRAO, existente]);
    expect(plano.map((p) => p.objetivo)).toEqual(["captar_lead"]);
  });

  it("funil ARQUIVADO com o objetivo não conta como existente, mas o slug dele continua ocupado", () => {
    const arquivado: FunilExistente = {
      id: "p2",
      name: "Vendas",
      slug: "vendas",
      position: 2000,
      is_archived: true,
      settings: { objetivo: "vender_produto" },
    };
    const [produto] = planoDosFunisExtras(["vender_produto"], [PADRAO, arquivado]);
    expect(produto!.objetivo).toBe("vender_produto");
    expect(produto!.slug).not.toBe("vendas");
  });

  it("nome que colide com funil ativo ganha sufixo — não nasce funil com nome repetido", () => {
    const mesmoNome: FunilExistente = { ...PADRAO, name: "Vendas", slug: "vendas", settings: {} };
    const [produto] = planoDosFunisExtras(["vender_produto"], [mesmoNome]);
    expect(produto!.nome).not.toBe("Vendas");
    expect(produto!.nome.startsWith("Vendas")).toBe(true);
  });

  it("objetivo repetido na entrada vira um funil só", () => {
    expect(planoDosFunisExtras(["captar_lead", "captar_lead"], [PADRAO])).toHaveLength(1);
  });
});

describe("contextoDoPerfil", () => {
  it("sem perfil não diz nada", () => {
    expect(contextoDoPerfil(null)).toBeNull();
  });

  it("traduz canais e objetivos em rótulos legíveis, com o principal à frente", () => {
    const c = contextoDoPerfil({
      canais: ["whatsapp", "instagram"],
      objetivos: ["agendar", "vender_produto"],
    });
    expect(c).toEqual({
      canais: ["WhatsApp", "Instagram"],
      objetivos: ["Agendar horários", "Vender produtos"],
      objetivoPrincipal: "agendar",
    });
  });
});
