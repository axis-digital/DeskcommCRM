"use client";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useT } from "@/hooks/i18n/useT";
import { useBulkAction } from "@/hooks/kanban/useBulkAction";
import type { OwnerKind } from "@/lib/types/leads";
import { OwnerBadge } from "./OwnerBadge";

/** Valor do item "Sem responsável" no grupo de opções (o `null` não é valor de radio). */
const SEM_RESPONSAVEL = "__sem_responsavel";
/** O dono é um agente de IA: nenhum item de pessoa fica marcado. */
const AGENTE_DE_IA = "__agente_de_ia";

interface Props {
  leadId: string;
  pipelineId: string;
  /** `owner_user_id` do negócio: quem está marcado na lista. */
  donoUserId: string | null;
  /** O que o selo mostra (já resolvido por `resolveLeadOwner`). */
  owner: { kind: OwnerKind; name: string | null; agentVersion: number | null };
  /** Atribuir é ≥ manager NA ROTA (a mesma do lote); sem isto o selo é só leitura. */
  podeAtribuir: boolean;
}

/**
 * O responsável do negócio, no cabeçalho do dossiê — e quem pode, troca ali.
 *
 * O círculo pontilhado ("Sem responsável") e o disco do dono são o MESMO
 * `OwnerBadge` do card; aqui ele só ganha um botão em volta quando há permissão.
 * Sem permissão o selo fica como estava: um botão que a rota recusaria com 403
 * seria controle decorativo — o pior tipo, porque parece que o sistema falhou.
 *
 * Atribuir passa pela MESMA ação de lote (`assign`, um id): mesma regra de papel,
 * mesma validação de que o membro é da organização, mesma auditoria
 * (`leads.bulk_assigned`) e mesma releitura do quadro. Uma rota nova para um
 * negócio só seria uma segunda regra para divergir.
 *
 * A lista é de PESSOAS (membros atribuíveis). Passar um negócio a um agente de IA
 * continua sendo assunto das regras de roteamento, não deste atalho.
 */
export function ResponsavelDoNegocio({ leadId, pipelineId, donoUserId, owner, podeAtribuir }: Props) {
  const t = useT();
  const { data: membros } = useAssignableMembers(podeAtribuir);
  const lote = useBulkAction(pipelineId);

  const selo = <OwnerBadge ownerKind={owner.kind} ownerName={owner.name} agentVersion={owner.agentVersion} />;
  if (!podeAtribuir) return selo;

  const marcado = owner.kind === "ai" ? AGENTE_DE_IA : (donoUserId ?? SEM_RESPONSAVEL);

  function atribuir(escolhido: string) {
    // O Radix avisa também quando se escolhe quem já está marcado: mandar isso ao
    // servidor seria uma gravação (e uma linha de auditoria) sem mudança nenhuma.
    if (escolhido === marcado) return;
    const ownerId = escolhido === SEM_RESPONSAVEL ? null : escolhido;
    lote.mutate(
      { action: "assign", lead_ids: [leadId], params: { owner_user_id: ownerId } },
      {
        onSuccess: () =>
          toast.success(ownerId === null ? t("O negócio ficou sem responsável.") : t("Responsável atualizado.")),
      },
    );
  }

  const nomeAtual = owner.name ?? t("Sem responsável");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={lote.isPending}
          aria-label={`${t("Alterar responsável")}: ${nomeAtual}`}
          className="-mx-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:opacity-60"
        >
          {selo}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{t("Responsável")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={marcado} onValueChange={atribuir}>
          <DropdownMenuRadioItem value={SEM_RESPONSAVEL}>{t("Sem responsável")}</DropdownMenuRadioItem>
          {(membros ?? []).map((m) => (
            <DropdownMenuRadioItem key={m.user_id} value={m.user_id}>
              {m.full_name ?? t("Sem nome")}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
