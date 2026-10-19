"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Acima disto as pílulas não cabem numa linha a 1280px e viram ruído. */
export const LIMITE_EM_PILULAS = 4;

interface Props {
  funis: ReadonlyArray<{ id: string; name: string; is_default?: boolean }>;
  atualId: string;
  nomeAtual: string;
}

/**
 * Troca de funil no título do quadro.
 *
 * Cada funil é uma PÁGINA (`/app/pipelines/<id>`), então as pílulas são links,
 * não botões: Tab anda entre elas, o meio-clique abre em outra aba e o Next
 * pré-carrega o destino. Trocar descarta a query string, porque um filtro de um
 * funil aplicado no outro dá resultado fantasma.
 */
export function SeletorDeFunil({ funis, atualId, nomeAtual }: Props) {
  const t = useT();
  const router = useRouter();

  if (funis.length <= 1) {
    return <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{nomeAtual}</h1>;
  }

  if (funis.length <= LIMITE_EM_PILULAS) {
    return (
      <div className="min-w-0">
        <h1 className="sr-only">{nomeAtual}</h1>
        <nav
          aria-label={t("Trocar de funil")}
          data-testid="trocar-funil"
          className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/40 p-0.5"
        >
          {funis.map((f) => {
            const atual = f.id === atualId;
            return (
              <Link
                key={f.id}
                href={`/app/pipelines/${f.id}`}
                aria-current={atual ? "page" : undefined}
                data-testid={`trocar-funil-opcao-${f.id}`}
                title={f.is_default ? `${f.name} (${t("padrão")})` : f.name}
                className={cn(
                  "inline-flex min-h-11 max-w-[14rem] shrink-0 items-center truncate rounded-md px-3 text-sm font-medium transition-colors lg:min-h-8",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  atual
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{f.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <h1 className="sr-only">{nomeAtual}</h1>
      <Select
        value={funis.some((f) => f.id === atualId) ? atualId : undefined}
        onValueChange={(id) => {
          if (id !== atualId) router.push(`/app/pipelines/${id}`);
        }}
      >
        <SelectTrigger
          aria-label={`${t("Trocar de funil")}: ${nomeAtual}`}
          data-testid="trocar-funil"
          className="h-auto w-auto min-w-0 max-w-full gap-1.5 border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight shadow-none focus:ring-1 focus:ring-ring sm:max-w-[60%] [&>span]:truncate"
        >
          <SelectValue placeholder={nomeAtual} />
        </SelectTrigger>
        <SelectContent>
          {funis.map((f) => (
            <SelectItem key={f.id} value={f.id} data-testid={`trocar-funil-opcao-${f.id}`}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
