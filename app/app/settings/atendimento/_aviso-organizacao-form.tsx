"use client";
/**
 * Aviso de fora do horário da organização (#70): a porta de
 * `organizations.settings.aviso_fora_do_horario`, sem exigir agente de IA.
 * A regra mora em `lib/agent-engine/agent/configuracao-aviso-organizacao.ts`; a gravação,
 * em `/api/v1/aviso-organizacao`. Desligar não pede o resto do formulário e preserva o
 * que já estava gravado (janelas, texto e fuso).
 */
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import {
  configuracaoAvisoOrganizacaoSchema,
  TAMANHO_MAXIMO_DO_TEXTO,
  type ConfiguracaoAvisoOrganizacao,
} from "@/lib/agent-engine/agent/configuracao-aviso-organizacao";

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const FUSO_PADRAO = "America/Sao_Paulo";
const JANELA_PADRAO = { dow: 1, start: "09:00", end: "18:00" };

type Erros = Record<string, string>;

export function AvisoOrganizacaoForm({
  inicial,
  podeMudar,
}: {
  inicial: ConfiguracaoAvisoOrganizacao | null;
  podeMudar: boolean;
}) {
  const t = useT();
  // O rótulo é literal em cada ramo: `t()` sobre dado de função não é chave de
  // dicionário, e traduzir parâmetro livre mudaria o texto do operador na tela.
  function nomeDoDia(dow: number) {
    switch (dow) {
      case 0:
        return t("Domingo");
      case 1:
        return t("Segunda-feira");
      case 2:
        return t("Terça-feira");
      case 3:
        return t("Quarta-feira");
      case 4:
        return t("Quinta-feira");
      case 5:
        return t("Sexta-feira");
      default:
        return t("Sábado");
    }
  }
  const [enabled, setEnabled] = useState(inicial?.enabled ?? false);
  const [timezone, setTimezone] = useState(inicial?.timezone ?? FUSO_PADRAO);
  const [windows, setWindows] = useState(inicial?.windows ?? [JANELA_PADRAO]);
  const [notice, setNotice] = useState(inicial?.notice ?? "");
  const [erros, setErros] = useState<Erros>({});
  const [isPending, startTransition] = useTransition();

  function mudarJanela(indice: number, parte: Partial<(typeof windows)[number]>) {
    setWindows((atuais) => atuais.map((j, i) => (i === indice ? { ...j, ...parte } : j)));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const corpo = { enabled, timezone, windows, notice };

    if (enabled) {
      const resultado = configuracaoAvisoOrganizacaoSchema.safeParse(corpo);
      const novosErros: Erros = {};
      if (!resultado.success) {
        for (const problema of resultado.error.issues) {
          const campo = String(problema.path[0] ?? "geral");
          novosErros[campo] ??=
            campo === "windows"
              ? t("Informe ao menos uma janela, com o fim depois do início.")
              : campo === "timezone"
                ? t("Fuso horário inválido.")
                : t("Dados inválidos.");
        }
      }
      if (!notice.trim()) novosErros.notice = t("Escreva o texto do aviso.");
      setErros(novosErros);
      if (Object.keys(novosErros).length > 0) {
        toast.error(t("Corrija os campos destacados."));
        return;
      }
    } else {
      setErros({});
    }

    startTransition(async () => {
      try {
        await apiClient.patch("/api/v1/aviso-organizacao", enabled ? corpo : { enabled: false });
        toast.success(enabled ? t("Aviso de fora do horário salvo.") : t("Aviso de fora do horário desligado."));
      } catch (err) {
        toast.error(err instanceof Error ? t(err.message) : t("Não consegui salvar."));
      }
    });
  }

  const desabilitado = isPending || !podeMudar;

  return (
    <form onSubmit={salvar} className="flex max-w-3xl flex-col gap-4" data-testid="form-aviso-organizacao">
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">{t("Aviso de fora do horário")}</h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "Quando um cliente escreve fora das janelas abaixo, ele recebe este aviso uma vez por período fechado. Não precisa de agente de IA.",
            )}
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid="aviso-organizacao-enabled"
            checked={enabled}
            disabled={desabilitado}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">{t("Avisar clientes fora do horário de atendimento")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("Desligado, nada é enviado e as janelas e o texto ficam guardados.")}
            </span>
          </span>
        </label>

        {enabled && (
          <div className="space-y-4">
            <div className="max-w-sm space-y-1">
              <Label htmlFor="aviso-organizacao-fuso">{t("Fuso horário")}</Label>
              <Input
                id="aviso-organizacao-fuso"
                value={timezone}
                disabled={desabilitado}
                placeholder={FUSO_PADRAO}
                onChange={(e) => setTimezone(e.target.value)}
              />
              {erros.timezone && <p className="text-xs text-destructive">{erros.timezone}</p>}
            </div>

            <div className="space-y-2" data-testid="aviso-organizacao-janelas">
              <Label>{t("Janelas de atendimento")}</Label>
              {windows.map((janela, indice) => (
                <div key={indice} className="flex flex-wrap items-center gap-2" data-testid="aviso-organizacao-janela">
                  <select
                    aria-label={t("Dia da semana")}
                    value={janela.dow}
                    disabled={desabilitado}
                    onChange={(e) => mudarJanela(indice, { dow: Number(e.target.value) })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    {DIAS.map((dia, valor) => (
                      <option key={dia} value={valor}>
                        {nomeDoDia(valor)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    aria-label={t("Início")}
                    value={janela.start}
                    disabled={desabilitado}
                    onChange={(e) => mudarJanela(indice, { start: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">{t("até")}</span>
                  <input
                    type="time"
                    aria-label={t("Fim")}
                    value={janela.end}
                    disabled={desabilitado}
                    onChange={(e) => mudarJanela(indice, { end: e.target.value })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={desabilitado}
                    onClick={() => setWindows((atuais) => atuais.filter((_, i) => i !== indice))}
                  >
                    {t("Remover")}
                  </Button>
                </div>
              ))}
              {erros.windows && <p className="text-xs text-destructive">{erros.windows}</p>}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={desabilitado}
                onClick={() => setWindows((atuais) => [...atuais, JANELA_PADRAO])}
              >
                {t("Adicionar janela")}
              </Button>
            </div>

            <div className="space-y-1">
              <Label htmlFor="aviso-organizacao-texto">{t("Texto do aviso")}</Label>
              <Textarea
                id="aviso-organizacao-texto"
                value={notice}
                maxLength={TAMANHO_MAXIMO_DO_TEXTO}
                disabled={desabilitado}
                rows={4}
                onChange={(e) => setNotice(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {notice.length}/{TAMANHO_MAXIMO_DO_TEXTO}
              </p>
              {erros.notice && <p className="text-xs text-destructive">{erros.notice}</p>}
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={desabilitado}>
          {isPending ? t("Salvando…") : t("Salvar")}
        </Button>
        {!podeMudar && (
          <span className="text-xs text-muted-foreground">{t("Só quem administra a empresa pode alterar.")}</span>
        )}
      </div>
    </form>
  );
}
