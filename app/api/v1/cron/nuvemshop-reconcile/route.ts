/**
 * GET /api/v1/cron/nuvemshop-reconcile — a cada 30 min (docker/scheduler).
 *
 * Rede de segurança dos webhooks (spec §4.6): a Nuvemshop desativa o webhook
 * depois de 5 falhas seguidas, e este cron é o que garante que o pedido chega
 * em ≤ 30 min mesmo assim. Para cada integração saudável de org operante cujo
 * cursor tem mais de 25 min, inicia um run. Audita SÓ quando iniciou algo.
 */
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { depsDoCatalogoReais } from "@/lib/nuvemshop/sync/catalogo-deps";
import { depsReais } from "@/lib/nuvemshop/sync/deps";
import { iniciarCatalogo } from "@/lib/nuvemshop/sync/iniciar-catalogo";
import { iniciarSincronizacao } from "@/lib/nuvemshop/sync/iniciar";
import { convergirAssinaturasDaLoja } from "@/lib/nuvemshop/sync/assinaturas";
import { depsDeAssinaturasReais } from "@/lib/nuvemshop/sync/assinaturas-deps";
import { depsDosCarrinhosReais, varrerCarrinhosAbandonados } from "@/lib/nuvemshop/sync/carrinhos-abandonados";
import { ehOperante, STATUS_OPERANTE, statusDaOrgEmbutida } from "@/lib/organizacao/operante";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const IDADE_MINIMA_MS = 25 * 60_000;

interface LinhaDeIntegracao {
  organization_id: string;
  organizations: { status?: string | null } | Array<{ status?: string | null }> | null;
}
interface EstadoResumido {
  status: string;
  cursor_updated_at: string | null;
  trava_ate: string | null;
  ultimo_erro: string | null;
}

export function decidirQuemReconciliar(
  linhas: LinhaDeIntegracao[],
  estados: Map<string, EstadoResumido>,
  agora: Date,
): string[] {
  const limite = agora.getTime() - IDADE_MINIMA_MS;
  return linhas
    .filter((l) => ehOperante(statusDaOrgEmbutida(l.organizations)))
    .filter((l) => {
      const e = estados.get(l.organization_id);
      if (!e) return true;
      if (e.status === "error" && e.ultimo_erro === "auth") return false;
      if (e.status === "running" && e.trava_ate && Date.parse(e.trava_ate) > agora.getTime()) return false;
      return !e.cursor_updated_at || Date.parse(e.cursor_updated_at) < limite;
    })
    .map((l) => l.organization_id);
}

async function executar(req: NextRequest): Promise<Response> {
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403);
  const admin = createAdminClient();

  const { data: linhas, error } = await admin
    .from("tenant_integrations")
    .select("organization_id, organizations:organization_id!inner(status)")
    .eq("provider", "nuvemshop")
    .eq("status", "healthy")
    .eq("organizations.status", STATUS_OPERANTE);
  if (error) return fail("internal_error", "Não foi possível ler as integrações.", 500);

  const orgIds = (linhas ?? []).map((l) => (l as LinhaDeIntegracao).organization_id);
  const estados = new Map<string, EstadoResumido>();
  if (orgIds.length > 0) {
    const { data: lidos, error: erroEstado } = await admin
      .from("integration_sync_state")
      .select("organization_id, status, cursor_updated_at, trava_ate, ultimo_erro")
      .eq("provider", "nuvemshop")
      .eq("resource", "orders")
      .in("organization_id", orgIds);
    if (erroEstado) return fail("internal_error", "Não foi possível ler o estado da sincronização.", 500);
    for (const e of lidos ?? []) estados.set((e as { organization_id: string }).organization_id, e as EstadoResumido);
  }

  const deps = depsReais(admin);
  const depsDoCatalogo = depsDoCatalogoReais(admin);
  const depsAssinaturas = depsDeAssinaturasReais(admin);
  const depsCarrinhos = depsDosCarrinhosReais(admin);
  let iniciados = 0;
  let falhas = 0;
  let assinaturasCriadas = 0;
  let carrinhosRegistrados = 0;
  for (const orgId of decidirQuemReconciliar((linhas ?? []) as LinhaDeIntegracao[], estados, new Date())) {
    try {
      const r = await iniciarSincronizacao(deps, orgId, "reconciliacao");
      if (r.ok) {
        iniciados++;
        await audit({ action: "nuvemshop.sync_requested", organizationId: orgId, metadata: { origem: "reconciliacao", run_id: r.runId } });
      }
      // Catálogo: continua do produto mais novo espelhado. Quem audita é o fim
      // da varredura (e só se gravou algo); aqui nada a registrar.
      await iniciarCatalogo(depsDoCatalogo, orgId, "reconciliacao");
    } catch (err) {
      falhas++;
      logger.warn("[nuvemshop.reconcile] falha ao iniciar a loja", {
        organization_id: orgId,
        motivo: err instanceof Error ? err.message.slice(0, 200) : "erro_desconhecido",
      });
    }

    // Eventos do site (cadastro e carrinho abandonado). Cada passo é isolado: a
    // falha de um não pula o outro nem a loja seguinte, e só audita quando houve
    // efeito (rodada que não fez nada não escreve na trilha).
    //
    // 1) Lojas conectadas antes de um evento novo entrar na lista recebem a
    //    assinatura aqui, sem reconectar. Sem nada faltando, não chama a API.
    try {
      const a = await convergirAssinaturasDaLoja(depsAssinaturas, orgId);
      if (a.criadas > 0) {
        assinaturasCriadas += a.criadas;
        await audit({ action: "nuvemshop.assinaturas_convergidas", organizationId: orgId, metadata: { criadas: a.criadas, falhas: a.falhas } });
      }
    } catch (err) {
      logger.warn("[nuvemshop.reconcile] falha ao convergir as assinaturas", {
        organization_id: orgId,
        motivo: err instanceof Error ? err.message.slice(0, 200) : "erro_desconhecido",
      });
    }

    // 2) Carrinhos abandonados: a API só os guarda por 30 dias, então o fato é
    //    gravado aqui. Os já gravados custam uma consulta, não uma escrita.
    try {
      const c = await varrerCarrinhosAbandonados(depsCarrinhos, orgId);
      if (c.gravados > 0) {
        carrinhosRegistrados += c.gravados;
        await audit({
          action: "nuvemshop.carrinhos_abandonados_registrados",
          organizationId: orgId,
          metadata: { gravados: c.gravados, sem_contato: c.semContato, truncado: c.truncado },
        });
      }
    } catch (err) {
      logger.warn("[nuvemshop.reconcile] falha ao varrer os carrinhos abandonados", {
        organization_id: orgId,
        motivo: err instanceof Error ? err.message.slice(0, 200) : "erro_desconhecido",
      });
    }
  }
  return ok({ candidatos: orgIds.length, iniciados, falhas, assinaturas_criadas: assinaturasCriadas, carrinhos_registrados: carrinhosRegistrados });
}

export const GET = executar;
export const POST = executar;
