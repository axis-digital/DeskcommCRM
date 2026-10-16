"use client";

/**
 * Conexão com o GA4 (migration 9002). Measurement ID + API secret da
 * propriedade. O secret é só de escrita: a tela sabe que existe, nunca o
 * recebe de volta — campo em branco mantém o que já está gravado.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { testarConexaoGa4, updateGa4Connection } from "@/app/actions/settings/updateGa4Connection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EVENTOS_DE_VENDA_DO_GA4, type EventoDeVendaGa4 } from "@/lib/conversoes/regras-ga4";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/** Mesmo formato que `lerEstadoDaConexaoGa4` devolve; nunca traz o secret em claro. */
export interface EstadoDaConexaoGa4 {
  configurada: boolean;
  enabled: boolean;
  measurementId: string | null;
  wonEvent: EventoDeVendaGa4;
  temSegredo: boolean;
}

export function FormularioDoGa4({
  estado,
  idioma,
}: {
  estado: EstadoDaConexaoGa4;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [measurementId, setMeasurementId] = useState(estado.measurementId ?? "");
  const [segredo, setSegredo] = useState("");
  const [wonEvent, setWonEvent] = useState<EventoDeVendaGa4>(estado.wonEvent);
  const [ligado, setLigado] = useState(estado.enabled);

  function salvar() {
    startTransition(async () => {
      const resultado = await updateGa4Connection({
        measurement_id: measurementId,
        ...(segredo.trim() ? { api_secret: segredo.trim() } : {}),
        won_event: wonEvent,
        enabled: ligado,
      });
      if (!resultado.ok) {
        toast.error(
          resultado.error === "validation_failed"
            ? t("Confira o Measurement ID (G-XXXXXXX) e o API secret.")
            : t("Não foi possível salvar a conexão com o GA4."),
        );
        return;
      }
      setSegredo("");
      toast.success(t("Conexão com o GA4 salva."));
      router.refresh();
    });
  }

  function testar() {
    startTransition(async () => {
      const resultado = await testarConexaoGa4();
      if (resultado.ok) {
        toast.success(t("O GA4 aceitou o evento de teste."));
        return;
      }
      const motivos = resultado.mensagens ?? [resultado.error];
      toast.error(`${t("O GA4 recusou o evento de teste.")} ${motivos.join(" · ")}`);
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-6" data-testid="conexao-ga4">
      <div className="space-y-1">
        <Label htmlFor="ga4-measurement-id">Measurement ID</Label>
        <Input
          id="ga4-measurement-id"
          value={measurementId}
          placeholder="G-XXXXXXXXXX"
          onChange={(e) => setMeasurementId(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="ga4-api-secret">API secret</Label>
        <Input
          id="ga4-api-secret"
          type="password"
          autoComplete="off"
          value={segredo}
          onChange={(e) => setSegredo(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {estado.temSegredo
            ? t("Secret gravado. Deixe em branco para manter.")
            : t("GA4 › Administrador › Fluxos de dados › Measurement Protocol API secrets.")}
        </p>
      </div>

      <div className="flex flex-col gap-2 md:max-w-sm">
        <Label htmlFor="ga4-won-event">{t("Evento enviado na venda")}</Label>
        <select
          id="ga4-won-event"
          aria-describedby="ga4-won-event-ajuda"
          className="rounded-md border bg-background p-2 text-sm"
          value={wonEvent}
          onChange={(e) => setWonEvent(e.target.value as EventoDeVendaGa4)}
        >
          {EVENTOS_DE_VENDA_DO_GA4.map((ev) => (
            <option key={ev.valor} value={ev.valor}>
              {t(ev.rotulo)} ({ev.valor})
            </option>
          ))}
        </select>
        {/*
          A ajuda acompanha a escolha. Com purchase, o handler manda o id do
          negócio como transaction_id; no padrão, o funil de e-commerce mandaria
          close_convert_lead e a venda ficaria fora dos relatórios de compra.
        */}
        <p id="ga4-won-event-ajuda" className="text-xs text-muted-foreground">
          {wonEvent === "purchase"
            ? t(
                "O id do negócio vai como transaction_id, e o GA4 não conta a mesma venda duas vezes.",
              )
            : t(
                "Loja ou funil de pedidos? Escolha Compra (purchase): a venda entra nos relatórios de e-commerce do GA4.",
              )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="ga4-ligado"
          aria-label={t("Enviar ao GA4")}
          checked={ligado}
          onCheckedChange={setLigado}
        />
        <Label htmlFor="ga4-ligado">{t("Enviar ao GA4")}</Label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={salvar} disabled={isPending}>
          {isPending ? t("Salvando...") : t("Salvar")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={testar}
          disabled={isPending || !estado.configurada}
        >
          {t("Testar conexão")}
        </Button>
      </div>
    </Card>
  );
}
