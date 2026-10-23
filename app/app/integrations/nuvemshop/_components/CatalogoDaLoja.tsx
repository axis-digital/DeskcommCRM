import type { Idioma } from "@/lib/i18n/idiomas";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";

export type ResumoDoCatalogo = { totalProdutos: number; maisRecente: string | null };

export function CatalogoDaLoja({ resumo, idioma }: { resumo: ResumoDoCatalogo; idioma: Idioma }) {
  return (
    <section aria-labelledby="catalogo-da-loja" className="space-y-2 border-t border-border pt-3">
      <h2 id="catalogo-da-loja" className="font-medium">{traduzir("Catálogo", idioma)}</h2>
      <p data-testid="nuvemshop-produtos-total">
        {traduzir("Produtos sincronizados:", idioma)} {resumo.totalProdutos}
      </p>
      {resumo.maisRecente ? (
        <p className="text-muted-foreground">
          {traduzir("Produto mais recente atualizado em:", idioma)}{" "}
          {new Date(resumo.maisRecente).toLocaleString(tagDeIdioma(idioma))}
        </p>
      ) : (
        <p className="text-muted-foreground">{traduzir("O catálogo chega com a primeira sincronização.", idioma)}</p>
      )}
    </section>
  );
}
