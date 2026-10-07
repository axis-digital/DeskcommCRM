import { describe, expect, it } from "vitest";

import { LEAD_STAGES } from "@/lib/agent-engine/agent/lead-state";
import { ehEventoDeEtapaDoGa4, ehEventoDeVendaDoGa4 } from "@/lib/conversoes/regras-ga4";
import {
  eventoDaVendaDoObjetivo,
  eventoDeEtapaSugerido,
} from "@/lib/conversoes/mapa-de-eventos-ga4";
import { OBJETIVOS_DO_NEGOCIO } from "@/lib/onboarding/perfil-de-negocio";

describe("mapa jornada × evento do GA4 (tabela aprovada em 2026-10-07)", () => {
  it("primeira mensagem é generate_lead em qualquer objetivo", () => {
    for (const { valor } of OBJETIVOS_DO_NEGOCIO) {
      expect(eventoDeEtapaSugerido(valor, "new")).toBe("generate_lead");
    }
    expect(eventoDeEtapaSugerido(null, "new")).toBe("generate_lead");
  });

  it("'já respondi' e 'ganho' não viram regra de etapa", () => {
    for (const { valor } of OBJETIVOS_DO_NEGOCIO) {
      expect(eventoDeEtapaSugerido(valor, "contacted")).toBeNull();
      expect(eventoDeEtapaSugerido(valor, "won")).toBeNull();
    }
  });

  it("produto segue a jornada de e-commerce", () => {
    expect(eventoDeEtapaSugerido("vender_produto", "qualifying")).toBe("view_item");
    expect(eventoDeEtapaSugerido("vender_produto", "qualified")).toBe("add_to_cart");
    expect(eventoDeEtapaSugerido("vender_produto", "negotiating")).toBe("begin_checkout");
  });

  it("serviço, lead e agenda seguem a jornada de geração de lead", () => {
    for (const objetivo of ["vender_servico", "captar_lead", "agendar"] as const) {
      expect(eventoDeEtapaSugerido(objetivo, "qualifying")).toBe("working_lead");
      expect(eventoDeEtapaSugerido(objetivo, "qualified")).toBe("qualify_lead");
    }
    expect(eventoDeEtapaSugerido("vender_servico", "negotiating")).toBe("begin_checkout");
    expect(eventoDeEtapaSugerido("agendar", "negotiating")).toBe("schedule");
    expect(eventoDeEtapaSugerido("captar_lead", "negotiating")).toBeNull();
  });

  it("funil sem objetivo é tratado como funil de leads", () => {
    for (const passo of LEAD_STAGES) {
      expect(eventoDeEtapaSugerido(null, passo)).toBe(eventoDeEtapaSugerido("captar_lead", passo));
    }
  });

  it("perdido é close_unconvert_lead", () => {
    for (const { valor } of OBJETIVOS_DO_NEGOCIO) {
      expect(eventoDeEtapaSugerido(valor, "lost")).toBe("close_unconvert_lead");
    }
  });

  it("etapa sem passo não recebe sugestão", () => {
    expect(eventoDeEtapaSugerido("vender_produto", null)).toBeNull();
  });

  it("toda sugestão está no vocabulário de etapa do GA4", () => {
    for (const { valor } of [...OBJETIVOS_DO_NEGOCIO, { valor: null }]) {
      for (const passo of LEAD_STAGES) {
        const ev = eventoDeEtapaSugerido(valor, passo);
        if (ev !== null) expect(ehEventoDeEtapaDoGa4(ev), `${valor}/${passo} → ${ev}`).toBe(true);
      }
    }
  });

  it("venda: produto é purchase, os demais close_convert_lead, sem objetivo cai no padrão da conexão", () => {
    expect(eventoDaVendaDoObjetivo("vender_produto")).toBe("purchase");
    expect(eventoDaVendaDoObjetivo("vender_servico")).toBe("close_convert_lead");
    expect(eventoDaVendaDoObjetivo("captar_lead")).toBe("close_convert_lead");
    expect(eventoDaVendaDoObjetivo("agendar")).toBe("close_convert_lead");
    expect(eventoDaVendaDoObjetivo(null)).toBeNull();
    for (const { valor } of OBJETIVOS_DO_NEGOCIO) {
      expect(ehEventoDeVendaDoGa4(eventoDaVendaDoObjetivo(valor))).toBe(true);
    }
  });
});
