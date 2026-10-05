"use client";

/**
 * "Enviar vendas de contatos sem anúncio nem site" — desligada por padrão (0902).
 * Salva no clique: é uma chave só, sem formulário em volta.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { definirEnviarSemOrigem } from "@/app/actions/settings/definirEnviarSemOrigem";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

const ERRO: Record<string, string> = {
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar esta conexão.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
};

export function EnviarSemOrigem({ ligada, idioma }: { ligada: boolean; idioma: Idioma }) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [valor, setValor] = useState(ligada);
  const [isPending, startTransition] = useTransition();

  function mudar(novo: boolean) {
    setValor(novo);
    startTransition(async () => {
      const r = await definirEnviarSemOrigem(novo);
      if (r.ok) {
        toast.success(t("Conexão salva."));
        router.refresh();
        return;
      }
      setValor(!novo);
      toast.error(t(ERRO[r.error] ?? "Não consegui salvar agora."));
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="enviar_sem_origem">
            {t("Enviar vendas de contatos sem anúncio nem site")}
          </Label>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {t(
              "Venda de quem chegou sem anúncio, sem clique e sem passar pela página de rastreio. Sai para a Meta e para o Google com o telefone e o e-mail em hash. As plataformas a tratam como venda orgânica no otimizador. Vem desligado: ligue só se quiser que essas vendas entrem na otimização.",
            )}
          </p>
        </div>
        <Switch
          id="enviar_sem_origem"
          checked={valor}
          disabled={isPending}
          onCheckedChange={mudar}
        />
      </div>
    </Card>
  );
}
