/**
 * GET   /api/v1/aviso-organizacao — lê o aviso de fora do horário da organização.
 * PATCH /api/v1/aviso-organizacao — grava (admin).
 *
 * O PATCH faz merge não-destrutivo em dois níveis: preserva todas as demais chaves de
 * `organizations.settings` e troca só `aviso_fora_do_horario`.
 *
 * - `enabled: false` desliga SEM exigir o schema completo e preserva janelas, texto e
 *   fuso já gravados (ligar de novo não obriga a redigitar nada).
 * - `enabled: true` exige o contrato completo de
 *   `lib/agent-engine/agent/configuracao-aviso-organizacao.ts`.
 *
 * GET: manager+. PATCH: admin — é escrita em `organizations.settings`, mesmo gate da rota
 * irmã `/api/v1/settings/atendimento`. A organização vem SEMPRE da sessão, nunca do corpo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  configuracaoAvisoOrganizacaoSchema,
  lerConfiguracaoAvisoOrganizacao,
} from "@/lib/agent-engine/agent/configuracao-aviso-organizacao";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

type Registro = Record<string, unknown>;

function ehRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "aviso_organizacao" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) {
    return fail("internal_error", traduzir("Não foi possível ler a configuração.", authz.user.idioma), 500, { requestId });
  }

  const settings = (data as { settings?: unknown } | null)?.settings;
  const bruto = ehRegistro(settings) ? settings.aviso_fora_do_horario : undefined;
  return ok({ configuracao: lerConfiguracaoAvisoOrganizacao(bruto) }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "aviso_organizacao", allowPlatformAdmin: true });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const corpo: unknown = await req.json().catch(() => null);
  if (!ehRegistro(corpo) || typeof corpo.enabled !== "boolean") {
    return fail("validation_failed", t("Configuração inválida."), 422, { requestId });
  }

  let proximoBloco: Registro | null = null;
  if (corpo.enabled) {
    const parsed = configuracaoAvisoOrganizacaoSchema.safeParse(corpo);
    if (!parsed.success) {
      return fail("validation_failed", t("Configuração inválida."), 422, {
        details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
        requestId,
      });
    }
    proximoBloco = parsed.data;
  }

  const admin = createAdminClient();
  const { data: orgRow, error: erroDaLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (erroDaLeitura) return fail("internal_error", t("Não foi possível ler a configuração."), 500, { requestId });

  const atuais: Registro = ehRegistro((orgRow as { settings?: unknown } | null)?.settings)
    ? ((orgRow as { settings: Registro }).settings)
    : {};
  const blocoAtual: Registro = ehRegistro(atuais.aviso_fora_do_horario) ? atuais.aviso_fora_do_horario : {};
  const bloco: Registro = proximoBloco ?? { ...blocoAtual, enabled: false };

  const { error: erroAoGravar } = await admin
    .from("organizations")
    .update({ settings: { ...atuais, aviso_fora_do_horario: bloco } })
    .eq("id", authz.org.orgId);
  if (erroAoGravar) return fail("internal_error", t("Não foi possível salvar a configuração."), 500, { requestId });

  await audit({
    action: "settings.aviso_fora_do_horario_alterada",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: { enabled: corpo.enabled },
  });

  return ok({ configuracao: lerConfiguracaoAvisoOrganizacao(bloco), enabled: corpo.enabled }, { requestId });
}
