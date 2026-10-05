"use client";

/**
 * O que cada etapa do funil informa ao GA4 (migration 0902).
 *
 * Par do `_regrasMeta.tsx`. Uma linha por etapa ABERTA de cada funil: ligada,
 * ela manda o evento de etapa escolhido quando um negócio entra ali. A venda
 * não aparece aqui — ela é escolhida na conexão (`ga4_won_event`).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { salvarRegrasDeConversaoGa4 } from "@/app/actions/settings/salvarRegrasDeConversaoGa4";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  EVENTOS_DE_ETAPA_DO_GA4,
  rotuloDoEventoDoGa4,
  type EventoDeEtapaGa4,
  type RegraDeConversaoGa4,
} from "@/lib/conversoes/regras-ga4";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

import type { EtapaAberta } from "./_regrasGoogle";

interface Rascunho {
  enabled: boolean;
  ga4Event: EventoDeEtapaGa4;
}

const ERRO_EM_PORTUGUES: Record<string, string> = {
  validation_failed: "Escolha um evento da lista para cada etapa ligada.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar estas regras.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
  etapa_invalida: "Uma das etapas não existe mais ou foi fechada. Atualize a página.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
};

export function RegrasDeConversaoGa4({
  etapas,
  regras,
  idioma,
}: {
  etapas: EtapaAberta[];
  regras: RegraDeConversaoGa4[];
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const inicial = useMemo(() => {
    const porEtapa = new Map(regras.map((r) => [r.stageId, r]));
    return Object.fromEntries(
      etapas.map((e) => {
        const r = porEtapa.get(e.id);
        const rascunho: Rascunho = r
          ? { enabled: r.enabled, ga4Event: r.ga4Event }
          : { enabled: false, ga4Event: "generate_lead" };
        return [e.id, rascunho];
      }),
    ) as Record<string, Rascunho>;
  }, [etapas, regras]);

  const [rascunhos, setRascunhos] = useState(inicial);
  const ligadas = etapas.filter((e) => rascunhos[e.id]?.enabled).length;

  function mudar(id: string, parcial: Partial<Rascunho>) {
    setRascunhos((atual) => ({ ...atual, [id]: { ...atual[id]!, ...parcial } }));
  }

  function salvar() {
    startTransition(async () => {
      const resultado = await salvarRegrasDeConversaoGa4(
        etapas.map((e) => {
          const r = rascunhos[e.id]!;
          return { stage_id: e.id, enabled: r.enabled, ga4_event: r.ga4Event };
        }),
      );
      if (resultado.ok) {
        toast.success(t("Regras salvas."));
        router.refresh();
        return;
      }
      toast.error(t(ERRO_EM_PORTUGUES[resultado.error] ?? "Não consegui salvar agora."));
    });
  }

  if (etapas.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        {t("Crie um funil com etapas para escolher o que cada etapa informa ao GA4.")}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-6" data-testid="regras-ga4-por-etapa">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="font-medium">{t("Eventos do GA4 por etapa")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Quando um negócio entrar na etapa, o CRM envia o evento ao GA4 — só para contatos que vieram do site com o script de rastreio e o GA4 ligado.",
            )}
          </p>
        </div>
        <span className="text-sm text-muted-foreground" data-testid="etapas-ga4-enviando">
          {ligadas} {t("de")} {etapas.length} {t("etapas enviando")}
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {etapas.map((e) => {
          const r = rascunhos[e.id]!;
          return (
            <li key={e.id} className="rounded-md border p-4" data-testid={`regra-ga4-${e.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.funil}
                    {" · "}
                    {r.enabled ? t(rotuloDoEventoDoGa4(r.ga4Event)) : t("não envia evento")}
                  </p>
                </div>
                <Switch
                  aria-label={t("Enviar evento ao GA4 nesta etapa")}
                  checked={r.enabled}
                  onCheckedChange={(v) => mudar(e.id, { enabled: v })}
                />
              </div>

              {r.enabled && (
                <div className="mt-4 flex flex-col gap-2 md:max-w-sm">
                  <Label htmlFor={`evento-ga4-${e.id}`}>{t("Evento enviado ao GA4")}</Label>
                  <select
                    id={`evento-ga4-${e.id}`}
                    className="rounded-md border bg-background p-2 text-sm"
                    value={r.ga4Event}
                    onChange={(ev) =>
                      mudar(e.id, { ga4Event: ev.target.value as EventoDeEtapaGa4 })
                    }
                  >
                    {EVENTOS_DE_ETAPA_DO_GA4.map((ev) => (
                      <option key={ev.valor} value={ev.valor}>
                        {t(ev.rotulo)} ({ev.valor})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        {t(
          "Os eventos só saem quando o negócio muda de etapa — pela equipe, pela IA ou por automação. Movimentos anteriores a ligar a regra não são enviados.",
        )}
      </p>
      <div>
        <Button type="button" onClick={salvar} disabled={isPending}>
          {isPending ? t("Salvando...") : t("Salvar regras")}
        </Button>
      </div>
    </Card>
  );
}
