/**
 * As REGRAS SUGERIDAS do GA4: para cada funil, o evento que cada etapa
 * mandaria, a partir do objetivo do funil (`crm_pipelines.settings.objetivo`)
 * e do passo canônico da etapa (`crm_stages.agent_stage_hint`).
 *
 * Puro de propósito: a tela de Conversões mostra o resultado, e a action
 * `aplicarRegrasSugeridasGa4` RECALCULA a mesma coisa no servidor e só aceita
 * o par etapa → evento que sair daqui. A tabela de quem manda o quê mora em
 * `mapa-de-eventos-ga4.ts`; este arquivo só cruza funis, etapas e as regras
 * que já existem.
 *
 * Fica de fora: funil ou etapa arquivados, etapa sem passo (ou com passo fora
 * do vocabulário), passo sem sugestão (`contacted`, `won`) e funil que, depois
 * disso, ficou sem nenhuma proposta. Etapa que já tem regra continua na lista,
 * marcada `jaTemRegra` — a sugestão nunca sobrescreve.
 */
import { LEAD_STAGES, type LeadStage } from "@/lib/agent-engine/agent/lead-state";
import { eventoDeEtapaSugerido } from "@/lib/conversoes/mapa-de-eventos-ga4";
import type { EventoDeEtapaGa4 } from "@/lib/conversoes/regras-ga4";
import { lerObjetivoDoFunil, type ObjetivoDoNegocio } from "@/lib/onboarding/perfil-de-negocio";

export interface FunilParaSugestao {
  id: string;
  nome: string;
  /** `crm_pipelines.settings` cru — o objetivo é lido por `lerObjetivoDoFunil`. */
  settings: unknown;
  arquivado?: boolean;
}

export interface EtapaParaSugestao {
  id: string;
  pipelineId: string;
  nome: string;
  /** `crm_stages.agent_stage_hint` cru; null ou desconhecido = sem passo. */
  passo: string | null;
  arquivada?: boolean;
}

export interface RegraExistenteGa4 {
  stageId: string;
}

export interface PropostaDeRegraGa4 {
  stageId: string;
  etapa: string;
  evento: EventoDeEtapaGa4;
  jaTemRegra: boolean;
}

export interface SugestoesDoFunilGa4 {
  pipelineId: string;
  funil: string;
  /** null = funil sem objetivo, tratado como funil de leads. */
  objetivo: ObjetivoDoNegocio | null;
  propostas: PropostaDeRegraGa4[];
}

function comoPasso(valor: string | null): LeadStage | null {
  return valor && (LEAD_STAGES as readonly string[]).includes(valor) ? (valor as LeadStage) : null;
}

/** Funis e etapas na ordem em que chegaram (o chamador ordena por posição). */
export function sugerirRegrasGa4(entrada: {
  funis: readonly FunilParaSugestao[];
  etapas: readonly EtapaParaSugestao[];
  regras: readonly RegraExistenteGa4[];
}): SugestoesDoFunilGa4[] {
  const comRegra = new Set(entrada.regras.map((r) => r.stageId));

  return entrada.funis
    .filter((f) => !f.arquivado)
    .map((funil) => {
      const objetivo = lerObjetivoDoFunil(funil.settings);
      const propostas = entrada.etapas
        .filter((e) => e.pipelineId === funil.id && !e.arquivada)
        .flatMap((e): PropostaDeRegraGa4[] => {
          const evento = eventoDeEtapaSugerido(objetivo, comoPasso(e.passo));
          return evento
            ? [{ stageId: e.id, etapa: e.nome, evento, jaTemRegra: comRegra.has(e.id) }]
            : [];
        });
      return { pipelineId: funil.id, funil: funil.nome, objetivo, propostas };
    })
    .filter((f) => f.propostas.length > 0);
}

/** O que ainda pode ser criado: etapa → evento, só onde não há regra. */
export function paresAplicaveis(
  sugestoes: readonly SugestoesDoFunilGa4[],
): Map<string, EventoDeEtapaGa4> {
  return new Map(
    sugestoes.flatMap((f) =>
      f.propostas.filter((p) => !p.jaTemRegra).map((p) => [p.stageId, p.evento] as const),
    ),
  );
}
