import type { Metadata } from "next";
import Link from "next/link";

import { marcaDaSaida } from "@/lib/branding/saida";
import { PERIODOS, type TipoDeMudanca } from "@/lib/docs/changelog";
import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";

// O nome da marca vem do banco (via `marcaDaSaida`), então a página é dinâmica.
export const dynamic = "force-dynamic";

const LEDE =
  "Novidades, correções e ajustes de interface desta instalação, do mais recente ao mais antigo.";

export const metadata: Metadata = {
  title: "Changelog",
  description: LEDE,
};

const ROTULO: Record<TipoDeMudanca, string> = {
  novo: "Novo",
  corrigido: "Corrigido",
  interface: "Interface",
};

// Cor por tipo: informação além do rótulo. O `dark:` segue o `data-theme` (globals.css).
const COR: Record<TipoDeMudanca, string> = {
  novo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  corrigido: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  interface: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

export default async function ChangelogPage() {
  // Nome da marca resolvido no servidor (banco acima do `.env`; nunca lança).
  const marca = await marcaDaSaida(null);
  // Visitante sem sessão: o idioma vem do Accept-Language (mesma função das páginas legais).
  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <p className="text-xs tracking-wider text-muted-foreground uppercase">{marca.nome}</p>
          <Link href="/login" className="text-sm underline underline-offset-2">
            {t("Entrar")}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="space-y-2 pb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Changelog</h1>
          <p className="max-w-prose text-sm text-muted-foreground">{t(LEDE)}</p>
        </div>

        <div className="space-y-6">
          {PERIODOS.map((periodo) => (
            <section
              key={periodo.id}
              id={periodo.id}
              aria-labelledby={`${periodo.id}-titulo`}
              className="scroll-mt-6 rounded-lg border bg-background p-6"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-4">
                <h2 id={`${periodo.id}-titulo`} className="text-lg font-semibold tracking-tight">
                  {periodo.titulo}
                </h2>
                <p className="font-mono text-xs text-muted-foreground">{periodo.intervalo}</p>
              </div>

              <ul className="space-y-3">
                {periodo.mudancas.map((mudanca) => (
                  <li
                    key={mudanca.texto}
                    className="grid grid-cols-1 items-baseline gap-x-4 gap-y-1 text-sm sm:grid-cols-[6.5rem_minmax(0,1fr)]"
                  >
                    <span
                      data-tipo={mudanca.tipo}
                      className={`w-fit rounded-md px-2 py-0.5 text-center font-mono text-[11px] font-medium tracking-wide uppercase ${COR[mudanca.tipo]}`}
                    >
                      {t(ROTULO[mudanca.tipo])}
                    </span>
                    <span className="min-w-0 leading-relaxed break-words">{mudanca.texto}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
