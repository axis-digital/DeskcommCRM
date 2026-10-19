"use client";

/**
 * Painel "Regras sugeridas" do GA4 (Entrega 1 / workstream D).
 *
 * Para cada funil, o evento que cada etapa informaria ao GA4, tirado do
 * objetivo do funil e do passo da etapa (`lib/conversoes/regras-sugeridas-ga4.ts`).
 * As etapas sem regra vêm pré-marcadas; a que já tem regra aparece como "já
 * configurada", sem caixa — aplicar nunca troca uma regra existente. O
 * servidor recalcula a sugestão antes de gravar (`aplicarRegrasSugeridasGa4`).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { aplicarRegrasSugeridasGa4 } from "@/app/actions/settings/aplicarRegrasSugeridasGa4";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { rotuloDoEventoDoGa4 } from "@/lib/conversoes/regras-ga4";
import type { SugestoesDoFunilGa4 } from "@/lib/conversoes/regras-sugeridas-ga4";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import { rotuloDoObjetivo } from "@/lib/onboarding/perfil-de-negocio";

const ERRO_EM_PORTUGUES: Record<string, string> = {
  validation_failed: "Uma das sugestões mudou ou não vale mais. Atualize a página.",
  sugestao_invalida: "Uma das sugestões mudou ou não vale mais. Atualize a página.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar estas regras.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
};

export function RegrasSugeridasGa4({
  sugestoes,
  idioma,
}: {
  sugestoes: SugestoesDoFunilGa4[];
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const aplicaveis = useMemo(
    () => sugestoes.flatMap((f) => f.propostas.filter((p) => !p.jaTemRegra)),
    [sugestoes],
  );
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(
    () => new Set(aplicaveis.map((p) => p.stageId)),
  );
  const escolhidas = aplicaveis.filter((p) => marcadas.has(p.stageId));

  function alternar(stageId: string, marcada: boolean) {
    setMarcadas((atual) => {
      const proxima = new Set(atual);
      if (marcada) proxima.add(stageId);
      else proxima.delete(stageId);
      return proxima;
    });
  }

  function aplicar() {
    startTransition(async () => {
      const resultado = await aplicarRegrasSugeridasGa4(
        escolhidas.map((p) => ({ stageId: p.stageId, evento: p.evento })),
      );
      if (resultado.ok) {
        toast.success(
          resultado.criadas > 0
            ? `${resultado.criadas} ${t("regra(s) criada(s).")}`
            : t("Nenhuma regra criada: essas etapas já estavam configuradas."),
        );
        router.refresh();
        return;
      }
      toast.error(t(ERRO_EM_PORTUGUES[resultado.error] ?? "Não consegui aplicar agora."));
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-6" data-testid="regras-sugeridas-ga4">
      <div className="max-w-2xl">
        <h3 className="font-medium">{t("Regras sugeridas")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Pelo objetivo de cada funil e pelo passo de cada etapa, o CRM sugere o evento que a etapa informa ao GA4. Aplicar cria só as regras que ainda não existem — nenhuma regra configurada é trocada.",
          )}
        </p>
      </div>

      {sugestoes.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="regras-sugeridas-ga4-vazio">
          {t(
            "Nenhuma sugestão por enquanto: as sugestões saem do passo de cada etapa (novo, em qualificação, qualificado, negociando, perdido). Confira as etapas dos seus funis.",
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {sugestoes.map((funil) => (
            <section
              key={funil.pipelineId}
              className="rounded-md border p-4"
              data-testid={`sugestoes-ga4-${funil.pipelineId}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{funil.funil}</p>
                <Badge variant={funil.objetivo ? "info" : "neutral"}>
                  {funil.objetivo
                    ? t(rotuloDoObjetivo(funil.objetivo))
                    : t("Sem objetivo — tratado como funil de leads")}
                </Badge>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {funil.propostas.map((p) => {
                  const rotulo = `${t(rotuloDoEventoDoGa4(p.evento))} (${p.evento})`;
                  return (
                    <li
                      key={p.stageId}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      data-testid={`sugestao-ga4-${p.stageId}`}
                    >
                      {p.jaTemRegra ? (
                        <>
                          <span className="min-w-0">
                            {p.etapa} → {rotulo}
                          </span>
                          <Badge variant="neutral">{t("já configurada")}</Badge>
                        </>
                      ) : (
                        <label className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={marcadas.has(p.stageId)}
                            onChange={(e) => alternar(p.stageId, e.target.checked)}
                            disabled={isPending}
                          />
                          <span>
                            {p.etapa} → {rotulo}
                          </span>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {sugestoes.length > 0 && aplicaveis.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="regras-sugeridas-ga4-completas">
          {t("Todas as etapas sugeridas já têm regra.")}
        </p>
      )}

      {aplicaveis.length > 0 && (
        <div>
          <Button type="button" onClick={aplicar} disabled={isPending || escolhidas.length === 0}>
            {isPending ? t("Aplicando...") : t("Aplicar sugestões")}
          </Button>
        </div>
      )}
    </Card>
  );
}
