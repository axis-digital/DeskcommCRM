/** Planejamento puro: não reserva, libera ou altera sessões nem expõe credenciais. */
export interface SessaoNoInventario {
  nome: string;
  server: string;
  status: string;
}

export interface ProxyNoInventario {
  id: number;
  server: string;
  status: "livre" | "atribuido" | "invalido";
  sessao: string | null;
  valido: boolean;
}

type Motivo = "proxy_compartilhado" | "proxy_fora_do_pool" | "proxy_invalido" |
  "atribuicao_divergente" | "proxy_atribuido_a_outra_sessao";

/** A entrada deve incluir todas as sessões da instância, inclusive paradas e falhas. */
export function planejarInventarioDeProxies(sessoes: SessaoNoInventario[], proxies: ProxyNoInventario[]): {
  atribuicoes: Array<{ proxyId: number; sessao: string }>;
  conflitos: Array<{ sessao: string; motivo: Motivo }>;
} {
  const atribuicoes: Array<{ proxyId: number; sessao: string }> = [];
  const conflitos: Array<{ sessao: string; motivo: Motivo }> = [];
  const ativos = new Set(["WORKING", "STARTING", "SCAN_QR_CODE"]);
  for (const sessao of sessoes) {
    if (!ativos.has(sessao.status) || !sessao.server) continue;
    let motivo: Motivo | undefined;
    const matching = proxies.filter((p) => p.server === sessao.server);
    const proxy = matching[0];
    if (sessoes.filter((s) => s.server === sessao.server).length > 1 || matching.length > 1) motivo = "proxy_compartilhado";
    else if (!proxy) motivo = "proxy_fora_do_pool";
    else if (!proxy.valido || proxy.status === "invalido") motivo = "proxy_invalido";
    else if (proxies.some((p) => p.status === "atribuido" && p.sessao === sessao.nome && p.id !== proxy.id)) motivo = "atribuicao_divergente";
    else if (proxy.status === "atribuido" && proxy.sessao !== sessao.nome) motivo = "proxy_atribuido_a_outra_sessao";
    if (motivo) conflitos.push({ sessao: sessao.nome, motivo });
    else if (proxy && proxy.status === "livre" && proxy.sessao === null) atribuicoes.push({ proxyId: proxy.id, sessao: sessao.nome });
    else if (proxy && proxy.status === "livre") conflitos.push({ sessao: sessao.nome, motivo: "atribuicao_divergente" });
  }
  return { atribuicoes, conflitos };
}
