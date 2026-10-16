import { describe, expect, it } from "vitest";

import { PACOTES } from "@/lib/onboarding/pacotes-de-funil";
import {
  CANAIS_DE_VENDA,
  MAX_FUNIS_POR_OBJETIVO,
  OBJETIVOS_DO_NEGOCIO,
  lerObjetivoDoFunil,
  lerPerfilDeNegocio,
  pacoteDoObjetivo,
  perfilDeNegocioSchema,
} from "@/lib/onboarding/perfil-de-negocio";

describe("perfil do negócio", () => {
  it("aceita vários canais e vários objetivos", () => {
    const perfil = perfilDeNegocioSchema.parse({
      canais: ["whatsapp", "loja_online"],
      objetivos: ["vender_produto", "agendar"],
    });
    expect(perfil.objetivos).toEqual(["vender_produto", "agendar"]);
  });

  it("exige ao menos um objetivo", () => {
    expect(perfilDeNegocioSchema.safeParse({ canais: ["whatsapp"], objetivos: [] }).success).toBe(
      false,
    );
  });

  it("recusa canal e objetivo fora do vocabulário", () => {
    expect(
      perfilDeNegocioSchema.safeParse({ canais: ["tiktok"], objetivos: ["captar_lead"] }).success,
    ).toBe(false);
    expect(
      perfilDeNegocioSchema.safeParse({ canais: ["whatsapp"], objetivos: ["dominar_o_mundo"] })
        .success,
    ).toBe(false);
  });

  it("remove repetição mantendo a ordem em que a pessoa marcou", () => {
    const perfil = perfilDeNegocioSchema.parse({
      canais: ["whatsapp", "whatsapp"],
      objetivos: ["agendar", "vender_produto", "agendar"],
    });
    expect(perfil.canais).toEqual(["whatsapp"]);
    expect(perfil.objetivos).toEqual(["agendar", "vender_produto"]);
  });

  it("lê o perfil de organizations.settings e devolve null quando ausente ou inválido", () => {
    expect(lerPerfilDeNegocio(null)).toBeNull();
    expect(lerPerfilDeNegocio({})).toBeNull();
    expect(lerPerfilDeNegocio({ perfil_de_negocio: { canais: [], objetivos: ["x"] } })).toBeNull();
    expect(
      lerPerfilDeNegocio({
        branding: {},
        perfil_de_negocio: { canais: ["telefone"], objetivos: ["captar_lead"] },
      }),
    ).toEqual({ canais: ["telefone"], objetivos: ["captar_lead"] });
  });

  it("lê o objetivo do funil de crm_pipelines.settings, null quando ausente ou inválido", () => {
    expect(lerObjetivoDoFunil(null)).toBeNull();
    expect(lerObjetivoDoFunil({ objetivo: "vender_servico" })).toBe("vender_servico");
    expect(lerObjetivoDoFunil({ objetivo: "outro" })).toBeNull();
    expect(lerObjetivoDoFunil("texto")).toBeNull();
  });

  it("todo objetivo aponta para um pacote de funil que existe", () => {
    const ids = PACOTES.map((p) => p.id);
    for (const { valor } of OBJETIVOS_DO_NEGOCIO) {
      expect(ids).toContain(pacoteDoObjetivo(valor).id);
    }
    expect(pacoteDoObjetivo("vender_produto").id).toBe("loja");
    expect(pacoteDoObjetivo("agendar").id).toBe("clinica");
    expect(pacoteDoObjetivo("vender_servico").id).toBe("servicos");
    expect(pacoteDoObjetivo("captar_lead").id).toBe("generico");
  });

  it("rótulos existem para todo valor e o teto de funis cobre os objetivos", () => {
    for (const c of CANAIS_DE_VENDA) expect(c.rotulo.length).toBeGreaterThan(2);
    for (const o of OBJETIVOS_DO_NEGOCIO) expect(o.rotulo.length).toBeGreaterThan(2);
    expect(MAX_FUNIS_POR_OBJETIVO).toBe(3);
  });
});
