"use client";

import { useId } from "react";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import {
  CANAIS_DE_VENDA,
  OBJETIVOS_DO_NEGOCIO,
  type CanalDeVenda,
  type ObjetivoDoNegocio,
} from "@/lib/onboarding/perfil-de-negocio";

export interface ValorDoPerfil {
  canais: CanalDeVenda[];
  objetivos: ObjetivoDoNegocio[];
}

interface Props {
  valor: ValorDoPerfil;
  onChange: (valor: ValorDoPerfil) => void;
  disabled?: boolean;
}

/**
 * Marca/desmarca sem mutar a lista recebida. Marcar ACRESCENTA no fim: a ordem
 * é a ordem em que a pessoa escolheu, e o 1º objetivo é o do funil padrão.
 */
function alternar<T extends string>(lista: readonly T[], item: T): T[] {
  return lista.includes(item) ? lista.filter((v) => v !== item) : [...lista, item];
}

/**
 * Os dois grupos do PERFIL DO NEGÓCIO — usados nas boas-vindas do onboarding
 * e em Configurações › Organização, para a mesma pergunta não divergir entre
 * as duas telas. O envio por `FormData.getAll` (`canais`, `objetivos`) sai de
 * inputs ocultos gerados do ESTADO, não dos checkboxes: o FormData segue a
 * ordem do DOM, e a ordem que importa é a do clique.
 *
 * Vocabulário e rótulos vêm de `lib/onboarding/perfil-de-negocio.ts`.
 */
export function CamposDoPerfil({ valor, onChange, disabled }: Props) {
  const t = useT();
  const idDaAjuda = useId();
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{t("Por onde vocês vendem?")}</legend>
        <p className="text-xs text-muted-foreground">
          {t("Marque todos os que valem. Pode deixar em branco se ainda não vende.")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CANAIS_DE_VENDA.map((canal) => {
            const marcado = valor.canais.includes(canal.valor);
            return (
              <label
                key={canal.valor}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors",
                  marcado ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                <input
                  type="checkbox"
                  value={canal.valor}
                  checked={marcado}
                  onChange={() =>
                    onChange({ ...valor, canais: alternar(valor.canais, canal.valor) })
                  }
                />
                <span>{t(canal.rotulo)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled} aria-describedby={idDaAjuda}>
        <legend className="text-sm font-medium">
          {t("O que vocês querem que a conversa vire?")}
        </legend>
        <p id={idDaAjuda} className="text-xs text-muted-foreground">
          {t("Marque ao menos um. Cada objetivo pode virar um quadro de clientes próprio.")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OBJETIVOS_DO_NEGOCIO.map((objetivo) => {
            const marcado = valor.objetivos.includes(objetivo.valor);
            return (
              <label
                key={objetivo.valor}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors",
                  marcado ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                <input
                  type="checkbox"
                  value={objetivo.valor}
                  checked={marcado}
                  onChange={() =>
                    onChange({
                      ...valor,
                      objetivos: alternar(valor.objetivos, objetivo.valor),
                    })
                  }
                />
                <span>{t(objetivo.rotulo)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {valor.canais.map((c) => (
        <input key={`canal-${c}`} type="hidden" name="canais" value={c} />
      ))}
      {valor.objetivos.map((o) => (
        <input key={`objetivo-${o}`} type="hidden" name="objetivos" value={o} />
      ))}
    </div>
  );
}
