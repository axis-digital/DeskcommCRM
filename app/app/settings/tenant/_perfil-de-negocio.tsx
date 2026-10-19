"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updatePerfilDeNegocio } from "@/app/actions/settings/updatePerfilDeNegocio";
import { CamposDoPerfil, type ValorDoPerfil } from "@/components/perfil-de-negocio/CamposDoPerfil";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import type { PerfilDeNegocio } from "@/lib/onboarding/perfil-de-negocio";

interface Props {
  /** O que `lerPerfilDeNegocio` devolveu; `null` = organização ainda sem perfil. */
  initial: PerfilDeNegocio | null;
}

/**
 * Configurações › Organização › Perfil do negócio — a mesma pergunta das
 * boas-vindas, editável depois. Os grupos são o mesmo componente do onboarding.
 */
export function PerfilDeNegocioForm({ initial }: Props) {
  const t = useT();
  const [valor, setValor] = useState<ValorDoPerfil>(() => initial ?? { canais: [], objetivos: [] });
  const [isPending, startTransition] = useTransition();
  const semObjetivo = valor.objetivos.length === 0;

  function salvar() {
    startTransition(async () => {
      const resultado = await updatePerfilDeNegocio(valor);
      if (resultado.ok) {
        toast.success(t("Perfil do negócio salvo."));
        return;
      }
      toast.error(t("Não foi possível salvar o perfil do negócio."));
    });
  }

  return (
    <Card className="space-y-4 p-4" data-testid="perfil-de-negocio">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("Perfil do negócio")}</h2>
        <p className="text-xs text-muted-foreground">
          {t(
            "Por onde vocês vendem e o que a conversa deve virar. É daqui que saem os quadros de clientes sugeridos e o evento de conversão de cada etapa.",
          )}
        </p>
      </div>
      <CamposDoPerfil valor={valor} onChange={setValor} disabled={isPending} />
      <Button type="button" size="sm" disabled={isPending || semObjetivo} onClick={salvar}>
        {t("Salvar perfil do negócio")}
      </Button>
    </Card>
  );
}
