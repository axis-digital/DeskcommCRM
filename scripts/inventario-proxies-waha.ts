/** Consulta local, somente leitura: WAHA do app principal e pool de rastreio.
 * Não lê arquivos .env nem traz senhas do banco ou da configuração das sessões.
 * Um resultado é uma fotografia, não autorização para aplicar a reconciliação.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { planejarInventarioDeProxies, type ProxyNoInventario, type SessaoNoInventario } from "../lib/waha/inventario-proxies";

const lerWaha = `
(async () => {
  const base = process.env.WAHA_API_BASE_URL;
  const key = process.env.WAHA_API_KEY;
  if (!base || !key) throw new Error('WAHA indisponível na configuração do app');
  const response = await fetch(base.replace(/\\/$/, '') + '/api/sessions?all=true', {
    headers: { 'X-Api-Key': key }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('WAHA respondeu HTTP ' + response.status);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Lista de sessões inválida');
  const sessions = data.map(s => ({ nome: s.name, status: s.status, server: s.config?.proxy?.server ?? '' }));
  if (sessions.some(s => typeof s.nome !== 'string' || typeof s.status !== 'string' || typeof s.server !== 'string')) {
    throw new Error('Sessão com campos inválidos');
  }
  process.stdout.write(JSON.stringify(sessions));
})().catch(() => { process.stderr.write('Falha ao consultar o WAHA'); process.exitCode = 1; });`;

const lerPool = `BEGIN READ ONLY;
SELECT coalesce(json_agg(json_build_object('id', id, 'server', proxy_address || ':' || port,
  'status', status, 'sessao', assigned_session, 'valido', valid)), '[]'::json)
FROM public.waha_proxy_pool;
ROLLBACK;`;

function executar(): void {
  const sessoes = JSON.parse(execFileSync("docker", ["exec", "deskcommcrm-app-1", "node", "-e", lerWaha], { encoding: "utf8" })) as SessaoNoInventario[];
  const raw = execFileSync("docker", ["exec", "-i", "postgres", "psql", "-U", "postgres", "-d", "rastreio_total", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"], { input: lerPool, encoding: "utf8" });
  const proxies = JSON.parse(raw.trim()) as ProxyNoInventario[];
  if (!Array.isArray(proxies) || proxies.some((p) => !Number.isInteger(p.id) || typeof p.server !== "string" || !["livre", "atribuido", "invalido"].includes(p.status))) {
    throw new Error("Resposta do pool inválida");
  }
  const plano = planejarInventarioDeProxies(sessoes, proxies);
  const referencia = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
  process.stdout.write(JSON.stringify({
    observacao: "Somente leitura; WAHA e banco foram consultados separadamente.",
    sessoes: sessoes.length,
    atribuicoes_propostas: plano.atribuicoes.map((a) => ({ proxy_id: a.proxyId, sessao_ref: referencia(a.sessao) })),
    conflitos: plano.conflitos.map((c) => ({ sessao_ref: referencia(c.sessao), motivo: c.motivo })),
  }, null, 2) + "\n");
}

try { executar(); } catch {
  process.stderr.write("Inventário incompleto: nenhuma atribuição foi realizada.\n");
  process.exitCode = 1;
}
