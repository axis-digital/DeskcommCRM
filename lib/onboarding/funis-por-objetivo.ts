/**
 * OS FUNIS EXTRAS DO ONBOARDING — um por objetivo marcado além do primeiro.
 *
 * Um funil tem UM objetivo (`crm_pipelines.settings.objetivo`): o mesmo passo
 * `qualified` é `add_to_cart` num funil de produto e `qualify_lead` num funil de
 * leads. Quem marcou "Agendar" e "Vender produtos" no perfil precisa de dois
 * quadros, não de um quadro que finge servir aos dois.
 *
 * O primeiro objetivo é o do funil padrão (o que o passo já monta com a IA). Os
 * seguintes, até `MAX_FUNIS_POR_OBJETIVO` funis no total, nascem do quadro
 * pronto do objetivo (`pacoteDoObjetivo`), com etapas e passo.
 *
 * Puro: sem rede e sem banco. Quem grava é `app/actions/onboarding/montarQuadro.ts`.
 */
import { z } from "zod";

import { chaveDeNome, slugDeNome } from "@/lib/leads/stage-editing";
import { posicaoEntre } from "@/lib/pipelines/pipeline-editing";
import { etapasParaGravar, type EtapaParaGravar } from "@/lib/onboarding/proposta-de-funil";
import {
  CANAIS_DE_VENDA,
  MAX_FUNIS_POR_OBJETIVO,
  lerObjetivoDoFunil,
  objetivoDoNegocioSchema,
  pacoteDoObjetivo,
  rotuloDoObjetivo,
  type ObjetivoDoNegocio,
  type PerfilDeNegocio,
} from "@/lib/onboarding/perfil-de-negocio";

/** O que o plano precisa saber de cada funil da organização (arquivados inclusive). */
export interface FunilExistente {
  id: string;
  name: string;
  slug: string;
  position: number;
  is_archived: boolean;
  settings: unknown;
  /** Os nomes das colunas, em ordem. Ausente = desconhecidas (não entra na comparação). */
  colunas?: readonly string[];
}

/** Um funil a criar. `settings` já leva o objetivo — o funil nunca nasce sem ele. */
export interface FunilAPlanejar {
  objetivo: ObjetivoDoNegocio;
  nome: string;
  slug: string;
  position: number;
  settings: { objetivo: ObjetivoDoNegocio };
  etapas: EtapaParaGravar[];
}

/** Os objetivos além do primeiro, cortados no teto de funis do onboarding. */
export function objetivosExtras(perfil: PerfilDeNegocio | null): ObjetivoDoNegocio[] {
  if (!perfil) return [];
  return perfil.objetivos.slice(1, MAX_FUNIS_POR_OBJETIVO);
}

const marcadosSchema = z.array(z.unknown()).max(20);

/**
 * O que veio marcado na tela, reduzido ao que o PERFIL oferece.
 *
 * O corpo do formulário só ESCOLHE entre os extras do perfil gravado no banco;
 * nunca nomeia um objetivo que a organização não declarou.
 */
export function extrasMarcados(
  bruto: unknown,
  perfil: PerfilDeNegocio | null,
): ObjetivoDoNegocio[] {
  const oferecidos = objetivosExtras(perfil);
  const lista = marcadosSchema.safeParse(bruto);
  if (!lista.success) return [];
  const validos = lista.data
    .map((v) => objetivoDoNegocioSchema.safeParse(v))
    .filter((r) => r.success)
    .map((r) => r.data);
  return oferecidos.filter((o) => validos.includes(o));
}

/** "Vendas", e se já houver um funil ATIVO chamado assim, "Vendas 2", "Vendas 3"… */
function nomeLivre(nome: string, nomesAtivos: string[]): string {
  const ocupadas = new Set(nomesAtivos.map(chaveDeNome));
  if (!ocupadas.has(chaveDeNome(nome))) return nome;
  for (let n = 2; ; n += 1) {
    const candidato = `${nome} ${n}`;
    if (!ocupadas.has(chaveDeNome(candidato))) return candidato;
  }
}

/**
 * O quadro pronto do objetivo tem exatamente estas colunas, na mesma ordem?
 *
 * Compara pela `chaveDeNome` (sem caixa nem acento), a mesma régua do editor
 * de etapas. Usada pelo plano e pela tela, que esconde o extra repetido.
 */
export function repeteQuadroAtivo(
  objetivo: ObjetivoDoNegocio,
  colunas: readonly string[],
): boolean {
  const doPacote = pacoteDoObjetivo(objetivo).proposta.etapas.map((e) => chaveDeNome(e.nome));
  return (
    doPacote.length === colunas.length &&
    doPacote.every((nome, i) => nome === chaveDeNome(colunas[i] ?? ""))
  );
}

/**
 * Os funis que faltam criar, já com nome, slug e posição livres.
 *
 * ⚠️ IDEMPOTENTE POR OBJETIVO: objetivo que já tem funil ATIVO na organização
 * fica de fora — reaplicar o passo não duplica. Arquivado não conta (a pessoa
 * tirou aquele quadro da frente), mas o slug dele segue ocupado:
 * `uniq_crm_pipelines_org_slug` não é parcial.
 *
 * ⚠️ E NÃO REPETE QUADRO: objetivo cujo quadro pronto tem as mesmas colunas de
 * um funil ativo também fica de fora. Numa clínica, o quadro principal já é o
 * de agendamento; o extra de "Agendar" nascia como "Agendamentos 2", idêntico.
 */
export function planoDosFunisExtras(
  marcados: readonly ObjetivoDoNegocio[],
  funis: readonly FunilExistente[],
): FunilAPlanejar[] {
  const jaTem = new Set(
    funis.filter((f) => !f.is_archived).map((f) => lerObjetivoDoFunil(f.settings)),
  );
  const slugs = funis.map((f) => f.slug);
  const nomesAtivos = funis.filter((f) => !f.is_archived).map((f) => f.name);
  const quadrosAtivos = funis
    .filter((f) => !f.is_archived && f.colunas)
    .map((f) => f.colunas as readonly string[]);
  let ultima = funis.reduce<number | null>(
    (max, f) => (max === null || f.position > max ? f.position : max),
    null,
  );

  const plano: FunilAPlanejar[] = [];
  for (const objetivo of new Set(marcados)) {
    if (jaTem.has(objetivo)) continue;
    if (quadrosAtivos.some((colunas) => repeteQuadroAtivo(objetivo, colunas))) continue;
    const { proposta } = pacoteDoObjetivo(objetivo);
    const nome = nomeLivre(proposta.nome, nomesAtivos);
    const slug = slugDeNome(nome, slugs, "funil");
    const position = posicaoEntre(ultima, null);

    plano.push({
      objetivo,
      nome,
      slug,
      position,
      settings: { objetivo },
      etapas: etapasParaGravar(proposta, slugDeNome),
    });
    jaTem.add(objetivo);
    slugs.push(slug);
    nomesAtivos.push(nome);
    ultima = position;
  }
  return plano;
}

/** O perfil em palavras, para o pedido de sugestão à IA. */
export interface ContextoDoPerfil {
  canais: string[];
  objetivos: string[];
  /** O objetivo do quadro que a IA vai sugerir — o do funil padrão. */
  objetivoPrincipal: ObjetivoDoNegocio;
}

export function contextoDoPerfil(perfil: PerfilDeNegocio | null): ContextoDoPerfil | null {
  const principal = perfil?.objetivos[0];
  if (!perfil || !principal) return null;
  return {
    canais: perfil.canais.map((c) => CANAIS_DE_VENDA.find((x) => x.valor === c)?.rotulo ?? c),
    objetivos: perfil.objetivos.map(rotuloDoObjetivo),
    objetivoPrincipal: principal,
  };
}
