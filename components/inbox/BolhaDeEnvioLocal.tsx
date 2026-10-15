"use client";
import { useT } from "@/hooks/i18n/useT";
import { formatBytes } from "@/components/inbox/media/media-utils";
import { BOLHA_SAIDA_ESCURO } from "@/components/inbox/MessageBubble";
import { Button } from "@/components/ui/button";
import type { EnvioDeMidia } from "@/lib/messaging/media/envio-otimista";
import { CircleNotch, FileText, WarningOctagon } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  envio: EnvioDeMidia;
  onTentarDeNovo: () => void;
  onDescartar: () => void;
}

/**
 * A bolha do anexo que ainda não virou mensagem (ver `envio-otimista.ts`).
 *
 * Desenha a prévia do PRÓPRIO arquivo (`blob:`), não a rota de mídia da
 * mensagem: ainda não há linha nem arquivo no Storage para buscar. Na falha,
 * arquivo e legenda continuam aqui, e "Tentar de novo" reaproveita o que já
 * subiu.
 */
export function BolhaDeEnvioLocal({ envio, onTentarDeNovo, onDescartar }: Props) {
  const t = useT();
  const falhou = envio.fase === "falhou";

  return (
    <div className="flex w-full min-w-0 justify-end px-4 py-1">
      <div
        data-testid="bolha-de-envio-local"
        data-fase={envio.fase}
        className={cn(
          "relative max-w-[75%] min-w-0 rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm",
          BOLHA_SAIDA_ESCURO,
          falhou && "border border-destructive",
        )}
      >
        <div className={cn(envio.legenda && "mb-1", !falhou && "opacity-80")}>
          {envio.tipo === "image" && envio.previa ? (
            <img src={envio.previa} alt={envio.arquivo.name} className="block w-64 max-w-full aspect-[4/3] rounded-lg object-cover" />
          ) : envio.tipo === "video" && envio.previa ? (
            <video src={envio.previa} muted className="block w-64 max-w-full rounded-lg" />
          ) : (
            <div className="flex items-center gap-3 py-1">
              <FileText size={24} weight="duotone" aria-hidden />
              <div className="min-w-0">
                <p className="truncate font-medium">{envio.arquivo.name}</p>
                <p className="text-xs opacity-80">{formatBytes(envio.arquivo.size)}</p>
              </div>
            </div>
          )}
        </div>

        {envio.legenda && <p className="whitespace-pre-wrap wrap-anywhere leading-snug">{envio.legenda}</p>}

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px]" role="status">
          {falhou ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-destructive" title={envio.erro ? t(envio.erro) : undefined}>
              <WarningOctagon size={10} weight="fill" aria-hidden /> {t("Não enviada")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <CircleNotch size={10} className="animate-spin" aria-hidden /> {t("Enviando…")}
            </span>
          )}
        </div>

        {falhou && (
          <div className="mt-2 space-y-1 border-t border-current/20 pt-2">
            {envio.erro && <p className="text-xs">{t(envio.erro)}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-primary-foreground hover:bg-primary-foreground/15" onClick={onDescartar}>
                {t("Descartar")}
              </Button>
              <Button size="sm" variant="secondary" className="h-7" onClick={onTentarDeNovo}>
                {t("Tentar de novo")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
