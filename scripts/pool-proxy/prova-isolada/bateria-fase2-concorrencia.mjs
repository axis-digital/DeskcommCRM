// Bateria do contrato v1 contra o provisionador n8n ISOLADO + WAHA de teste.
// Roda dentro do container proxytest-waha (mesma rede do n8n). Nunca imprime credenciais.
const K = process.env.K;
const T = process.env.T;
const N = process.env.N ?? "http://n8n_webhook:5678/webhook/proxytest/provisiona-proxy-v1";
const OPS = [];

const waha = async (m, p, b) => {
  const r = await fetch("http://localhost:3000" + p, {
    method: m,
    headers: { "X-Api-Key": K, "Content-Type": "application/json" },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const call = async (body, tok = T) => {
  const r = await fetch(N, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(tok ? { Authorization: "Bearer " + tok } : {}),
    },
    body: JSON.stringify(body),
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const req = (session_name, extra = {}) => ({
  instance: "principal",
  session_name,
  operation_id: crypto.randomUUID(),
  ...extra,
});
const novaSessao = async (name, config = {}) => {
  const r = await waha("POST", "/api/sessions", { name, start: false, config });
  if (r.s >= 300) throw new Error(`criar ${name}: ${r.s} ${JSON.stringify(r.b)?.slice(0, 200)}`);
};
const lerSessao = async (name) => {
  const r = await waha("GET", "/api/sessions/" + name);
  return { status: r.b?.status, server: r.b?.config?.proxy?.server, config: r.b?.config };
};

let falhas = 0;
const check = (nome, cond, detalhe) => {
  if (!cond) falhas++;
  console.log(`${cond ? "OK  " : "FALHA"} ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};
const res = (r) =>
  `${r.s} ${r.b?.resultado ?? JSON.stringify(r.b)}${r.b?.codigo ? "/" + r.b.codigo : ""}`;
for (const n of ["ptest-x", "ptest-y", "ptest-z"]) await novaSessao(n);
const rs = await Promise.all([
  call(req("ptest-x")),
  call(req("ptest-y")),
  call(req("ptest-z")),
  call(req("ptest-x")),
]);
console.log("     respostas:", rs.map(res).join(" | "));
const conf = rs.filter((x) => x.b?.resultado === "confirmado");
const esg = rs.filter((x) => x.b?.resultado === "pool_esgotado");
const sessoes = new Set(conf.map((x) => x.b.sessao));
const servers = new Set(conf.map((x) => x.b.server));
check(
  "concorrência: exatamente 1 sessão ganhou a linha livre",
  sessoes.size === 1,
  `${sessoes.size} sessões, ${conf.length} confirmados, ${esg.length} esgotados`,
);
check("concorrência: um só proxy foi entregue", servers.size === 1, `${servers.size}`);
const xs = rs
  .filter((_, i) => i === 0 || i === 3)
  .filter((x) => x.b?.resultado === "confirmado")
  .map((x) => x.b.server);
check(
  "concorrência: chamadas repetidas da mesma sessão concordam",
  new Set(xs).size <= 1,
  xs.join(" vs "),
);
console.log(falhas === 0 ? "\nTODOS OS CASOS OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
