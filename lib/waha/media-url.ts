/**
 * O endereço pelo qual o WAHA baixa a mídia que o CRM envia.
 *
 * A URL assinada do Storage nasce com a base PÚBLICA (`NEXT_PUBLIC_SUPABASE_URL`),
 * e o WAHA precisa baixá-la antes de responder ao `sendImage`/`sendFile`. Num
 * servidor que não faz hairpin — container chamando o IP público do próprio
 * host —, a conexão nunca abre: medido na Axis em 2026-10-14, todo envio de
 * mídia pelo CRM estourava o teto de 30s (`waha_timeout`), enquanto o mesmo
 * caminho pelo Caddy interno respondia em 2ms.
 *
 * Só a ORIGEM muda: a assinatura do Storage vale pelo caminho e pelo `token`,
 * não pelo host. URL de outro domínio passa intacta, e nada aqui lança — o
 * pior caso é o comportamento de antes.
 */
export function reescreverOrigemDaMidia(url: string, origemPublica: string, baseInterna: string): string {
  if (!baseInterna.trim()) return url;
  try {
    const alvo = new URL(url);
    if (alvo.origin !== new URL(origemPublica).origin) return url;
    return `${new URL(baseInterna).origin}${alvo.pathname}${alvo.search}`;
  } catch {
    return url;
  }
}
