/**
 * A conexão GA4 da organização — `ad_platform_connections` com platform='ga4'.
 * `dataset_id` = Measurement ID; `access_token_encrypted` = API secret.
 *
 * ⚠️ Admin client e `organization_id` no filtro, sempre (lição da #236 — ver
 * `../credenciais.ts`). A tabela tem RLS sem policy: pela sessão volta vazio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehEventoDeVendaDoGa4, type EventoDeVendaGa4 } from "@/lib/conversoes/regras-ga4";
import { logger } from "@/lib/logger";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import type { CredencialGa4 } from "./measurement-protocol";

type Motivo =
  | "leitura_indisponivel"
  | "sem_conexao"
  | "conexao_desabilitada"
  | "credencial_incompleta"
  | "cifra_indisponivel";

interface Linha {
  dataset_id: string | null;
  access_token_encrypted: string | null;
  enabled: boolean;
  ga4_won_event: string | null;
}

async function lerLinha(admin: SupabaseClient, organizationId: string) {
  return admin
    .from("ad_platform_connections")
    .select("dataset_id, access_token_encrypted, enabled, ga4_won_event")
    .eq("organization_id", organizationId)
    .eq("platform", "ga4")
    .maybeSingle();
}

/** Venda desconhecida ou ausente cai no padrão do produto, nunca quebra a leitura. */
function eventoDeVenda(valor: string | null): EventoDeVendaGa4 {
  return ehEventoDeVendaDoGa4(valor) ? valor : "close_convert_lead";
}

export async function lerCredencialGa4(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ ok: true; credencial: CredencialGa4 } | { ok: false; motivo: Motivo }> {
  const { data, error } = await lerLinha(admin, organizationId);
  if (error) {
    logger.error("[conversoes.ga4.credencial] leitura falhou", {
      organizationId,
      error: error.message,
    });
    return { ok: false, motivo: "leitura_indisponivel" };
  }
  if (!data) return { ok: false, motivo: "sem_conexao" };
  const linha = data as Linha;
  if (!linha.enabled) return { ok: false, motivo: "conexao_desabilitada" };
  if (!linha.dataset_id || !linha.access_token_encrypted) {
    return { ok: false, motivo: "credencial_incompleta" };
  }
  const apiSecret = await decryptWebhookSecret(admin, linha.access_token_encrypted);
  if (!apiSecret) return { ok: false, motivo: "cifra_indisponivel" };
  return {
    ok: true,
    credencial: {
      measurementId: linha.dataset_id,
      apiSecret,
      wonEvent: eventoDeVenda(linha.ga4_won_event),
    },
  };
}

/** Estado para a tela de configuração. Nunca devolve o secret em claro, só se existe. */
export async function lerEstadoDaConexaoGa4(admin: SupabaseClient, organizationId: string) {
  const { data, error } = await lerLinha(admin, organizationId);
  if (error) throw new Error("Não foi possível ler a conexão com o GA4.");
  const linha = data as Linha | null;
  return {
    configurada: Boolean(linha),
    enabled: linha?.enabled ?? false,
    measurementId: linha?.dataset_id ?? null,
    wonEvent: eventoDeVenda(linha?.ga4_won_event ?? null),
    temSegredo: Boolean(linha?.access_token_encrypted),
  };
}
