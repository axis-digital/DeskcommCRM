/**
 * Um produto bruto da API → linha de `nuvemshop_products` (spec 06 §3.3).
 *
 * TOLERANTE como o pedido: só exige o que a tradução não pode inventar (id,
 * nome e data de atualização). Campo novo da Nuvemshop passa (`passthrough`) e
 * produto ruim vira `ErroDeTraducao`, para a página seguir sem ele.
 */
import { z } from "zod";

import { centavosDe, ErroDeTraducao, isoDe } from "./traduzir-pedido";

const idSchema = z.union([z.number(), z.string()]);
const textoPorIdioma = z.union([z.string(), z.record(z.string(), z.string().nullish())]);

export const produtoNuvemshopSchema = z
  .object({
    id: idSchema,
    name: textoPorIdioma,
    description: textoPorIdioma.nullish(),
    canonical_url: z.string().nullish(),
    images: z.array(z.object({ src: z.string().nullish() }).passthrough()).nullish(),
    variants: z
      .array(
        z
          .object({
            price: z.union([z.string(), z.number()]).nullish(),
            stock: z.number().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
    updated_at: z.string(),
  })
  .passthrough();

export interface LinhaDeProduto {
  external_id: string;
  title: string;
  description: string | null;
  price_cents: number;
  available_qty: number;
  url: string | null;
  image_url: string | null;
  last_updated_at: string;
  payload: Record<string, unknown>;
}

/** O pt primeiro; sem ele, o primeiro idioma que tiver texto. */
function textoDe(valor: z.infer<typeof textoPorIdioma> | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return valor.trim() || null;
  const pt = valor.pt?.trim();
  if (pt) return pt;
  for (const v of Object.values(valor)) if (v?.trim()) return v.trim();
  return null;
}

function semHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function traduzirProduto(bruto: unknown): LinhaDeProduto {
  const parsed = produtoNuvemshopSchema.safeParse(bruto);
  if (!parsed.success) throw new ErroDeTraducao("produto_invalido");
  const p = parsed.data;

  const title = textoDe(p.name);
  if (!title) throw new ErroDeTraducao("produto_sem_nome");

  const descricao = textoDe(p.description);
  const precos = (p.variants ?? [])
    .map((v) => (v.price === null || v.price === undefined ? null : centavosDe(v.price)))
    .filter((c): c is number => c !== null);
  const estoque = (p.variants ?? []).reduce((soma, v) => soma + (v.stock && v.stock > 0 ? v.stock : 0), 0);

  return {
    external_id: String(p.id),
    title,
    description: descricao ? semHtml(descricao) || null : null,
    // A variante mais barata é o "a partir de" da vitrine. Sem preço, zero:
    // a coluna é `not null` e a loja pode ter produto ainda sem preço.
    price_cents: precos.length > 0 ? Math.min(...precos) : 0,
    available_qty: estoque,
    url: p.canonical_url?.trim() || null,
    image_url: p.images?.[0]?.src?.trim() || null,
    last_updated_at: isoDe(p.updated_at, "updated_at"),
    payload: p as Record<string, unknown>,
  };
}
