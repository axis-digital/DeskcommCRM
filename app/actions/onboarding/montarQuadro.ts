"use server";

/**
 * O PASSO "ONDE ELE ORGANIZA": pedir o quadro à IA e gravá-lo.
 *
 * Duas metades, e a separação é deliberada: `dadosDoPasso` só LÊ (chama a IA no
 * render e devolve a proposta para a tela mostrar) e `aplicarQuadro` só ESCREVE
 * (grava o que a pessoa aprovou). Fazer as duas num clique economizaria uma tela
 * e trocaria o quadro do dono por um texto que ele nunca viu.
 */
import { redirect } from "next/navigation";
import { generateText } from "ai";

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildModel, chaveDePlataforma } from "@/lib/ai/runtime/agent";
import { loadCredential } from "@/lib/ai/credentials";
import { slugDeNome } from "@/lib/leads/stage-editing";
import {
  etapasParaGravar,
  normalizarProposta,
  validarProposta,
  type PropostaDeFunil,
} from "@/lib/onboarding/proposta-de-funil";
import { escolherPacote, sugerirFunil, type Sugestao } from "@/lib/onboarding/sugerir-funil";
import {
  lerObjetivoDoFunil,
  lerPerfilDeNegocio,
  rotuloDoObjetivo,
  type ObjetivoDoNegocio,
  type PerfilDeNegocio,
} from "@/lib/onboarding/perfil-de-negocio";
import {
  contextoDoPerfil,
  extrasMarcados,
  objetivosExtras,
  planoDosFunisExtras,
  type FunilAPlanejar,
  type FunilExistente,
} from "@/lib/onboarding/funis-por-objetivo";
import {
  requireOnboardingCtx,
  patchOnboardingState,
  loadOnboardingState,
  OnboardingError,
} from "./_shared";

/** O funil que o gatilho semeou — o que a pessoa tem antes deste passo. */
export interface QuadroAtual {
  pipelineId: string;
  nome: string;
  colunas: string[];
}

/**
 * A versão publicada do funcionário criado no passo anterior.
 *
 * A sugestão sai DAQUI e não de uma configuração própria: é a chave que a pessoa
 * acabou de confirmar, e uma sugestão que funcionasse com outro modelo esconderia
 * justamente o defeito que ela precisa descobrir agora.
 */
async function cerebroDoFuncionario(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<{ provider: string; model: string; apiKey: string } | { erro: string }> {
  const { data: agente } = await admin
    .from("ai_agents")
    .select("published_version_id")
    .eq("organization_id", orgId)
    .eq("is_default", true)
    .maybeSingle();

  const versionId = agente?.published_version_id as string | null | undefined;
  if (!versionId) {
    // Quem pulou o passo de treinar, ou ficou com o agente em rascunho por não
    // ter número, chega aqui sem cérebro. Não é erro: é o quadro pronto.
    return { erro: "seu funcionário ainda não está no ar" };
  }

  const { data: versao } = await admin
    .from("ai_agent_versions")
    .select("provider, model, credential_id")
    .eq("id", versionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!versao) return { erro: "não achei a configuração do seu funcionário" };

  const provider = String(versao.provider ?? "");
  const model = String(versao.model ?? "");
  if (!provider || !model) return { erro: "seu funcionário está sem modelo definido" };

  // Mesma ordem do turno de produção e do ensaio: a credencial cadastrada vence,
  // e na falta dela vale a chave que veio na instalação.
  const credentialId = versao.credential_id as string | null;
  if (credentialId) {
    try {
      const cred = await loadCredential(credentialId, orgId);
      return { provider, model, apiKey: cred.apiKey };
    } catch {
      return { erro: "não consegui usar a chave cadastrada" };
    }
  }

  const daInstalacao = chaveDePlataforma(provider);
  if (!daInstalacao) return { erro: `esta instalação não tem chave de ${provider}` };
  return { provider, model, apiKey: daInstalacao };
}

async function carregarQuadroAtual(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<QuadroAtual | null> {
  const { data: funil } = await admin
    .from("crm_pipelines")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_default", true)
    .eq("is_archived", false)
    .maybeSingle();
  if (!funil) return null;

  const { data: etapas } = await admin
    .from("crm_stages")
    .select("name, position")
    .eq("organization_id", orgId)
    .eq("pipeline_id", funil.id)
    .eq("is_archived", false)
    .order("position");

  return {
    pipelineId: funil.id as string,
    nome: String(funil.name ?? ""),
    colunas: (etapas ?? []).map((e) => String(e.name ?? "")),
  };
}

/** Um funil a mais que o perfil pede — a tela oferece, pré-marcado. */
export interface FunilExtraOferecido {
  objetivo: ObjetivoDoNegocio;
  rotulo: string;
}

export interface DadosDoPasso {
  atual: QuadroAtual | null;
  sugestao: Sugestao;
  /** Vazio sem perfil, com um objetivo só, ou quando todos os extras já existem. */
  extras: FunilExtraOferecido[];
}

/**
 * O perfil do negócio gravado no passo de boas-vindas. Ausente, inválido ou
 * ilegível = `null`, e o passo se comporta exatamente como antes do perfil.
 */
async function lerPerfilDaOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<PerfilDeNegocio | null> {
  const { data, error } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return lerPerfilDeNegocio(data.settings);
}

/** Todos os funis da organização, arquivados inclusive (o slug deles segue ocupado). */
async function lerFunisDaOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<FunilExistente[] | { erro: string }> {
  const { data, error } = await admin
    .from("crm_pipelines")
    .select("id, name, slug, position, is_archived, settings")
    .eq("organization_id", orgId)
    .order("position");
  if (error) return { erro: error.message };
  return (data ?? []).map((f) => ({
    id: String(f.id),
    name: String(f.name ?? ""),
    slug: String(f.slug ?? ""),
    position: Number(f.position ?? 0),
    is_archived: Boolean(f.is_archived),
    settings: f.settings,
  }));
}

/**
 * O que a tela precisa para se desenhar: o quadro que existe hoje e a proposta.
 *
 * Roda no SERVIDOR, no render da página — não num clique. A pessoa chega no
 * passo com a proposta pronta na tela; pedir que ela clique em "gerar sugestão"
 * primeiro seria cobrar um passo a mais para chegar ao mesmo lugar.
 */
export async function dadosDoPasso(orgId: string, negocio: string): Promise<DadosDoPasso> {
  const admin = createAdminClient();
  const atual = await carregarQuadroAtual(admin, orgId);

  let oQueFaz = "";
  try {
    const { state } = await loadOnboardingState(orgId);
    oQueFaz = state.welcome?.o_que_faz ?? "";
  } catch {
    oQueFaz = "";
  }

  const perfil = await lerPerfilDaOrg(admin, orgId);
  const funis = await lerFunisDaOrg(admin, orgId);
  // Os extras que ainda não têm funil: o plano já descarta objetivo existente,
  // então ele mesmo diz o que oferecer. O funil padrão sai da conta — é o
  // quadro de cima, que ainda vai receber o 1º objetivo.
  const outros = "erro" in funis ? [] : funis.filter((f) => f.id !== atual?.pipelineId);
  const extras = planoDosFunisExtras(objetivosExtras(perfil), outros).map((f) => ({
    objetivo: f.objetivo,
    rotulo: rotuloDoObjetivo(f.objetivo),
  }));

  const ctx = { nome: negocio, oQueFaz, perfil: contextoDoPerfil(perfil) };
  const cerebro = await cerebroDoFuncionario(admin, orgId);

  if ("erro" in cerebro) {
    return {
      atual,
      sugestao: {
        origem: "pacote",
        pacote: escolherPacote(ctx),
        porque: cerebro.erro,
      },
      extras,
    };
  }

  const sugestao = await sugerirFunil(ctx, async ({ system, prompt }) => {
    const r = await generateText({
      model: buildModel(cerebro.provider, cerebro.apiKey, cerebro.model),
      system,
      prompt,
      // Teto baixo de propósito: são sete linhas de JSON. Um modelo que resolva
      // discursar bate no teto em vez de queimar o crédito de quem acabou de
      // colar a chave.
      maxOutputTokens: 900,
    });
    return r.text;
  });

  return { atual, sugestao, extras };
}

export type ResultadoDoQuadro =
  | { ok: true }
  | {
      ok: false;
      /**
       * Em português e já explicado — as recusas da função do banco são estados
       * NORMAIS do produto (funil com negócio, etapa usada por webhook), não
       * erros, e a pessoa precisa entender o que fazer.
       */
      erro: string;
    };

/**
 * Grava o quadro que a pessoa aprovou na tela.
 *
 * A proposta viaja da tela de volta para cá porque ela é EDITÁVEL: o que se
 * grava é o que a pessoa está vendo, não o que a IA propôs. Regerar aqui
 * entregaria um quadro diferente do aprovado — e num modelo com temperatura,
 * diferente a cada clique.
 */
export async function aplicarQuadro(formData: FormData): Promise<ResultadoDoQuadro> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError)
      return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
    throw err;
  }

  let bruta: unknown;
  try {
    bruta = JSON.parse(String(formData.get("quadro") ?? "null"));
  } catch {
    return { ok: false, erro: "Não consegui ler o quadro. Recarregue a página e tente de novo." };
  }

  // Revalida do lado de cá: o que chega de um formulário é entrada externa,
  // mesmo tendo saído daqui há dois minutos.
  const proposta: PropostaDeFunil = normalizarProposta(
    (bruta ?? {}) as { nome?: unknown; etapas?: unknown },
  );
  const veredito = validarProposta(proposta);
  if (!veredito.ok) return { ok: false, erro: veredito.erros.join(" ") };

  const admin = createAdminClient();
  const atual = await carregarQuadroAtual(admin, ctx.orgId);
  if (!atual) return { ok: false, erro: "Não encontrei o quadro desta empresa." };

  const funis = await lerFunisDaOrg(admin, ctx.orgId);
  if ("erro" in funis) return { ok: false, erro: `Não consegui ler os funis: ${funis.erro}` };

  // O perfil vem do BANCO; o corpo só escolhe entre os extras que ele oferece.
  const perfil = await lerPerfilDaOrg(admin, ctx.orgId);
  let extrasBrutos: unknown = [];
  try {
    extrasBrutos = JSON.parse(String(formData.get("extras") ?? "[]"));
  } catch {
    extrasBrutos = [];
  }
  const marcados = extrasMarcados(extrasBrutos, perfil);

  // O slug do funil não pode colidir com o de outro funil da organização
  // (`uniq_crm_pipelines_org_slug`). O do próprio funil sai da lista: renomear
  // "Pedidos" para "Pedidos" não pode virar "pedidos_2".
  const outros = funis.filter((f) => f.id !== atual.pipelineId);
  const slug = slugDeNome(
    proposta.nome,
    outros.map((p) => p.slug),
    "funil",
  );

  const { data: resposta, error } = await admin.rpc("fn_aplicar_quadro_do_onboarding", {
    p_organization_id: ctx.orgId,
    p_pipeline_id: atual.pipelineId,
    p_nome: proposta.nome,
    p_slug: slug,
    p_etapas: etapasParaGravar(proposta, slugDeNome).map((e) => ({
      nome: e.nome,
      slug: e.slug,
      position: e.position,
      is_won: e.is_won,
      is_lost: e.is_lost,
      agent_stage_hint: e.agent_stage_hint,
    })),
  });

  if (error) return { ok: false, erro: `Não consegui salvar o quadro: ${error.message}` };

  const r = (resposta ?? {}) as { ok?: boolean; motivo?: string; quantos?: number };
  if (!r.ok) {
    return { ok: false, erro: explicarRecusa(r.motivo, r.quantos) };
  }

  // O funil padrão é o do 1º objetivo. Sem perfil, `settings` fica intocado.
  // Objetivo já escolhido no editor de funil vence: reaplicar o passo não o
  // devolve ao 1º objetivo do perfil.
  const padrao = funis.find((f) => f.id === atual.pipelineId);
  const objetivoJaEscolhido = lerObjetivoDoFunil(padrao?.settings);
  const objetivo = objetivoJaEscolhido ?? perfil?.objetivos[0] ?? null;
  if (objetivo && !objetivoJaEscolhido) {
    const gravado = await gravarObjetivo(
      admin,
      ctx.orgId,
      atual.pipelineId,
      padrao?.settings,
      objetivo,
    );
    if (!gravado.ok) return gravado;
  }

  // Os extras: o plano já descarta objetivo que tem funil ativo — reaplicar o
  // passo não duplica. O padrão entra na conta com o nome e o objetivo novos.
  const funisDepois: FunilExistente[] = [
    ...outros,
    {
      id: atual.pipelineId,
      name: proposta.nome,
      slug,
      position: padrao?.position ?? 0,
      is_archived: false,
      settings: objetivo ? { objetivo } : padrao?.settings,
      // Extra cujo quadro pronto repete estas colunas não nasce (ver o plano).
      colunas: proposta.etapas.map((e) => e.nome),
    },
  ];
  const criados: Array<{ objetivo: ObjetivoDoNegocio; pipeline_id: string }> = [];
  for (const plano of planoDosFunisExtras(marcados, funisDepois)) {
    const criado = await criarFunilExtra(admin, ctx.orgId, plano);
    if (!criado.ok) {
      return {
        ok: false,
        erro:
          `Salvei o quadro principal, mas não consegui criar o funil de ${rotuloDoObjetivo(plano.objetivo)}. ` +
          `Tente de novo — o que já foi criado não se repete.`,
      };
    }
    criados.push({ objetivo: plano.objetivo, pipeline_id: criado.pipelineId });
    await audit({
      action: "pipeline.created",
      actorUserId: ctx.userId,
      organizationId: ctx.orgId,
      resourceType: "crm_pipeline",
      resourceId: criado.pipelineId,
      metadata: {
        name: plano.nome,
        slug: plano.slug,
        is_default: false,
        objetivo: plano.objetivo,
        origem: "onboarding",
      },
    });
  }

  const origem = String(formData.get("origem") ?? "pacote") === "ia" ? "ia" : "pacote";
  try {
    await patchOnboardingState(ctx.orgId, {
      funil: { pipeline_id: atual.pipelineId, origem, etapas: proposta.etapas.length },
    });
  } catch (err) {
    if (err instanceof OnboardingError)
      return {
        ok: false,
        erro: "Salvei o quadro, mas não consegui registrar o passo. Tente continuar de novo.",
      };
    throw err;
  }

  await audit({
    action: "onboarding.quadro_montado",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    resourceType: "crm_pipeline",
    resourceId: atual.pipelineId,
    metadata: {
      origem,
      etapas: proposta.etapas.length,
      nome: proposta.nome,
      objetivo,
      funis_extras: criados,
    },
  });

  redirect("/onboarding");
}

/**
 * Grava `settings.objetivo` por MERGE — as demais chaves (campos, motivos,
 * reabertura) ficam como estão. Filtra `organization_id` do contexto: o client
 * é service role e passa por cima da RLS.
 */
async function gravarObjetivo(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  pipelineId: string,
  settingsAtual: unknown,
  objetivo: ObjetivoDoNegocio,
): Promise<ResultadoDoQuadro> {
  const base =
    settingsAtual && typeof settingsAtual === "object" && !Array.isArray(settingsAtual)
      ? (settingsAtual as Record<string, unknown>)
      : {};
  const { error } = await admin
    .from("crm_pipelines")
    .update({ settings: { ...base, objetivo } })
    .eq("id", pipelineId)
    .eq("organization_id", orgId);
  if (error)
    return {
      ok: false,
      erro: `Salvei o quadro, mas não consegui gravar o objetivo: ${error.message}`,
    };
  return { ok: true };
}

/**
 * Cria um funil extra com as etapas — o mesmo caminho do `POST /api/v1/pipelines`
 * (funil, depois etapas, e COMPENSAÇÃO se as etapas falharem: funil sem etapa é
 * quadro morto). Sem SQL novo; o funil recém-criado não tem negócio, então
 * `crm_leads_pipeline_id_fkey ON DELETE RESTRICT` não atrapalha o desfazimento.
 */
async function criarFunilExtra(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  plano: FunilAPlanejar,
): Promise<{ ok: true; pipelineId: string } | { ok: false }> {
  const { data: criado, error } = await admin
    .from("crm_pipelines")
    .insert({
      organization_id: orgId,
      name: plano.nome,
      slug: plano.slug,
      position: plano.position,
      is_default: false,
      settings: plano.settings,
    })
    .select("id")
    .single();
  if (error || !criado) return { ok: false };
  const pipelineId = String((criado as { id: string }).id);

  const { error: etapasErr } = await admin.from("crm_stages").insert(
    plano.etapas.map((e) => ({
      organization_id: orgId,
      pipeline_id: pipelineId,
      name: e.nome,
      slug: e.slug,
      position: e.position,
      is_won: e.is_won,
      is_lost: e.is_lost,
      agent_stage_hint: e.agent_stage_hint,
    })),
  );
  if (etapasErr) {
    await admin.from("crm_pipelines").delete().eq("id", pipelineId).eq("organization_id", orgId);
    return { ok: false };
  }
  return { ok: true, pipelineId };
}

/** As recusas da função do banco, ditas para quem não sabe o que é uma FK. */
function explicarRecusa(motivo: string | undefined, quantos: number | undefined): string {
  switch (motivo) {
    case "funil_com_negocios":
      return (
        `Este quadro já tem ${quantos ?? "alguns"} cliente(s) dentro, então trocar as colunas agora ` +
        `deixaria eles sem lugar. Você pode ajustar as colunas depois, em CRM › Ver tudo em CRM › Etapas do funil.`
      );
    case "etapa_em_uso_por_webhook":
      return (
        "Uma das colunas atuais está sendo usada por uma integração que traz clientes de fora. " +
        "Trocar o quadro desligaria essa integração, então preferi não mexer — ajuste em CRM › Ver tudo em CRM › Etapas do funil."
      );
    case "funil_nao_encontrado":
      return "Não encontrei o quadro desta empresa. Recarregue a página.";
    default:
      return "Não consegui montar o quadro agora. Você pode fazer isso depois em CRM › Ver tudo em CRM › Etapas do funil.";
  }
}

export async function pularQuadro(): Promise<void> {
  const ctx = await requireOnboardingCtx();
  await patchOnboardingState(ctx.orgId, { funil: { skipped: true } });
  // Pular também é decisão, e é a que deixa o quadro de e-commerce de pé numa
  // clínica: sem registro, ninguém consegue explicar depois por que aquele
  // tenant tem "Carrinho abandonado" no quadro.
  await audit({
    action: "onboarding.quadro_pulado",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    resourceType: "organization",
    resourceId: ctx.orgId,
  });
  redirect("/onboarding");
}
