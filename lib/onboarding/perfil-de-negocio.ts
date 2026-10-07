/**
 * O PERFIL DO NEGÓCIO: por onde ele vende e o que ele quer que a conversa vire.
 *
 * Perguntado no onboarding (passo de boas-vindas) e editável em Configurações ›
 * Organização. Mora em `organizations.settings.perfil_de_negocio` — sem coluna
 * nova: o schema central é ESTE arquivo, e ninguém lê o caminho do jsonb sem
 * passar por `lerPerfilDeNegocio` (anti-pattern 6, `jsonb` lock-in).
 *
 * Objetivo é multi, mas um FUNIL tem um objetivo só (`crm_pipelines.settings.objetivo`):
 * o mesmo passo `qualified` é `add_to_cart` num funil de produto e `qualify_lead`
 * num funil de leads. Por isso o onboarding cria um funil por objetivo marcado.
 *
 * Spec: docs/superpowers/specs/2026-10-07-perfil-de-negocio-e-eventos-design.md
 */
import { z } from "zod";

import { PACOTES, PACOTE_PADRAO, type PacoteDeFunil } from "@/lib/onboarding/pacotes-de-funil";

export const CANAIS_DE_VENDA = [
  { valor: "loja_online", rotulo: "Loja online (site)" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "instagram", rotulo: "Instagram" },
  { valor: "loja_fisica", rotulo: "Loja física" },
  { valor: "telefone", rotulo: "Telefone" },
] as const;

export const OBJETIVOS_DO_NEGOCIO = [
  { valor: "vender_produto", rotulo: "Vender produtos" },
  { valor: "vender_servico", rotulo: "Vender serviços" },
  { valor: "captar_lead", rotulo: "Captar contatos interessados" },
  { valor: "agendar", rotulo: "Agendar horários" },
] as const;

export type CanalDeVenda = (typeof CANAIS_DE_VENDA)[number]["valor"];
export type ObjetivoDoNegocio = (typeof OBJETIVOS_DO_NEGOCIO)[number]["valor"];

const VALORES_DE_CANAL = CANAIS_DE_VENDA.map((c) => c.valor) as [CanalDeVenda, ...CanalDeVenda[]];
const VALORES_DE_OBJETIVO = OBJETIVOS_DO_NEGOCIO.map((o) => o.valor) as [
  ObjetivoDoNegocio,
  ...ObjetivoDoNegocio[],
];

/** Um funil por objetivo marcado; quatro objetivos, mas no máximo três funis. */
export const MAX_FUNIS_POR_OBJETIVO = 3;

function semRepeticao<T>(lista: readonly T[]): T[] {
  return [...new Set(lista)];
}

export const objetivoDoNegocioSchema = z.enum(VALORES_DE_OBJETIVO);

export const perfilDeNegocioSchema = z.object({
  canais: z.array(z.enum(VALORES_DE_CANAL)).max(VALORES_DE_CANAL.length * 2).transform(semRepeticao),
  objetivos: z
    .array(objetivoDoNegocioSchema)
    .min(1)
    .max(VALORES_DE_OBJETIVO.length * 2)
    .transform(semRepeticao),
});

export type PerfilDeNegocio = z.output<typeof perfilDeNegocioSchema>;

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/** Lê o perfil de `organizations.settings`. Ausente ou inválido = null (nunca lança). */
export function lerPerfilDeNegocio(settings: unknown): PerfilDeNegocio | null {
  const bruto = comoObjeto(settings)?.perfil_de_negocio;
  const r = perfilDeNegocioSchema.safeParse(bruto);
  return r.success ? r.data : null;
}

/** Lê o objetivo de `crm_pipelines.settings`. Ausente ou inválido = null (nunca lança). */
export function lerObjetivoDoFunil(settings: unknown): ObjetivoDoNegocio | null {
  const r = objetivoDoNegocioSchema.safeParse(comoObjeto(settings)?.objetivo);
  return r.success ? r.data : null;
}

const PACOTE_DO_OBJETIVO: Record<ObjetivoDoNegocio, string> = {
  vender_produto: "loja",
  vender_servico: "servicos",
  captar_lead: "generico",
  agendar: "clinica",
};

/** O quadro pronto que desenha o funil de um objetivo (funis extras do onboarding). */
export function pacoteDoObjetivo(objetivo: ObjetivoDoNegocio): PacoteDeFunil {
  return PACOTES.find((p) => p.id === PACOTE_DO_OBJETIVO[objetivo]) ?? PACOTE_PADRAO;
}

export function rotuloDoObjetivo(objetivo: ObjetivoDoNegocio): string {
  return OBJETIVOS_DO_NEGOCIO.find((o) => o.valor === objetivo)?.rotulo ?? objetivo;
}
