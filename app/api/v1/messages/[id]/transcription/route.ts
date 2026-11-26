/** Pedido explícito de transcrição; a fila e o worker de mídia fazem a leitura. */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type pg from "pg";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ehContatoPessoal } from "@/lib/contacts/contato-pessoal";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { MENSAGEM_REDIGIDA } from "@/lib/lgpd/cascata";
import { logger } from "@/lib/logger";
import {
  CHAVE_TRANSCRICAO_SOLICITADA_EM,
  CHAVE_TRANSCRICAO_SOB_DEMANDA,
  falhaDeTranscricaoParaPessoa,
  MARCADOR_NAO_LIDA,
} from "@/lib/messaging/media/derivable";
import { isMediaPathInOrganization } from "@/lib/messaging/media/upload-validation";

export const dynamic = "force-dynamic";
interface Ctx {
  params: Promise<{ id: string }>;
}
interface Audio {
  id: string;
  type: string;
  media_storage_path: string | null;
  media_derived_status: string | null;
  media_derived_text: string | null;
  metadata: Record<string, unknown> | null;
  body: string | null;
  revoked_at: string | null;
  is_group: boolean;
  is_personal: boolean;
}

async function transcricao(
  req: NextRequest,
  ctx: Ctx,
  guardaDeEscrita?: (orgId: string) => Promise<Response | null>,
): Promise<Response> {
  const pedir = Boolean(guardaDeEscrita);
  const requestId = req.headers.get("x-request-id") || randomUUID();
  const authz = await requireRole(pedir ? "agent" : "viewer", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", t("Mensagem inválida."), 422, { requestId });
  }
  const orgId = authz.org.orgId;
  if (pedir) {
    const bloqueio = await guardaDeEscrita!(orgId);
    if (bloqueio) return bloqueio;
    const limite = await checkRateLimit(`transcricao:${orgId}:${authz.user.id}`, 10, 60);
    if (!limite.allowed) {
      return fail("rate_limited", t("Aguarde um minuto antes de pedir outra transcrição."), 429, {
        requestId,
      });
    }
  }

  let db: pg.PoolClient | undefined;
  let confirmou = false;
  try {
    db = await getRequestPool().connect();
    await db.query("begin");
    // O lock serializa cliques de duas pessoas. O segundo pedido consulta a
    // fila DEPOIS de adquirir o lock, enxergando o evento já confirmado.
    const { rows } = await db.query<Audio>(
      `select m.id, m.type, m.media_storage_path, m.media_derived_status,
              m.media_derived_text, m.metadata, m.body, m.revoked_at,
              c.is_group, ct.is_personal
         from messages m
         join conversations c on c.id = m.conversation_id and c.organization_id = m.organization_id
         join contacts ct on ct.id = c.contact_id and ct.organization_id = m.organization_id
        where m.id = $1 and m.organization_id = $2
        for update of m`,
      [id, orgId],
    );
    const msg = rows[0];
    if (!msg) return fail("not_found", t("Mensagem não encontrada."), 404, { requestId });
    if (
      msg.type !== "audio" ||
      msg.is_group ||
      ehContatoPessoal(msg) ||
      msg.revoked_at ||
      msg.body === MENSAGEM_REDIGIDA ||
      msg.metadata?.media_status === "expired" ||
      !msg.media_storage_path ||
      !isMediaPathInOrganization(msg.media_storage_path, orgId)
    ) {
      return fail("state_conflict", t("Este áudio não está disponível para transcrição."), 409, {
        requestId,
      });
    }
    const texto = msg.media_derived_text?.trim();
    if (msg.media_derived_status === "ready" && texto && texto !== MARCADOR_NAO_LIDA) {
      return ok({ status: "ready", text: texto }, { requestId });
    }
    if (!pedir) {
      const falhou =
        msg.media_derived_status === "failed" || msg.media_derived_status === "skipped";
      return ok(
        {
          status: falhou ? "failed" : "pending",
          text: null,
          message: falhou
            ? t(falhaDeTranscricaoParaPessoa(msg.metadata?.media_derived_motivo))
            : null,
        },
        { requestId },
      );
    }
    const pendentes = await db.query(
      `select id from event_log where organization_id = $2 and entity_id = $1
         and event_type = 'media.derive_requested' and status in ('pending', 'processing') limit 1`,
      [id, orgId],
    );
    if (pendentes.rows.length)
      return ok({ status: "pending", text: null }, { requestId, status: 202 });

    await db.query(
      `update messages set media_derived_status = null, media_derived_text = null,
          metadata = (coalesce(metadata, '{}'::jsonb) - 'media_derived_motivo' - '${CHAVE_TRANSCRICAO_SOB_DEMANDA}')
                     || jsonb_build_object('${CHAVE_TRANSCRICAO_SOLICITADA_EM}', now())
        where id = $1 and organization_id = $2`,
      [id, orgId],
    );
    await db.query(
      `select public.emit_event('media.derive_requested', 'message', $1,
         jsonb_build_object('message_id', $1::uuid, 'transcricao_manual', true),
         jsonb_build_object('source', 'inbox_transcription'), $2)`,
      [id, orgId],
    );
    await db.query("commit");
    confirmou = true;
    void audit({
      action: "message.transcription_requested",
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "message",
      resourceId: id,
      requestId,
    });
    return ok({ status: "pending", text: null }, { requestId, status: 202 });
  } catch {
    logger.warn("[transcricao] não consegui consultar ou enfileirar o áudio", { requestId });
    return fail(
      "unavailable",
      t("Não foi possível pedir a transcrição agora. Tente novamente."),
      503,
      { requestId },
    );
  } finally {
    if (db) {
      if (!confirmou) {
        try {
          await db.query("rollback");
        } catch {
          /* conexão indisponível */
        }
      }
      db.release();
    }
  }
}

export const POST = (req: NextRequest, ctx: Ctx) =>
  transcricao(req, ctx, (orgId) => requireSupportWrite(orgId));
export const GET = (req: NextRequest, ctx: Ctx) => transcricao(req, ctx);
