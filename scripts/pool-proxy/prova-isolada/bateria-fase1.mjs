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

// ---------- autenticação e validação (nada disso toca WAHA nem pool) ----------
let r = await call(req("ptest-x"), null);
check("sem token é recusado", r.s === 401 || r.s === 403, res(r));
r = await call(req("ptest-x"), "token-errado");
check("token errado é recusado", r.s === 401 || r.s === 403, res(r));
r = await call(req("ptest-x", { extra: 1 }));
check("campo extra -> 400", r.s === 400, res(r));
r = await call({ instance: "principal", session_name: "ptest-x" });
check("falta operation_id -> 400", r.s === 400, res(r));
r = await call(req("ptest-x", { operation_id: "nao-e-uuid" }));
check("operation_id inválido -> 400", r.s === 400, res(r));
r = await call(req(" ptest-x"));
check("nome com espaço na ponta -> 400", r.s === 400, res(r));
r = await call(req("ptest-" + "a".repeat(60)));
check("nome > 54 -> 400", r.s === 400, res(r));
r = await call(req("sessao-de-outro-sistema"));
check("sessão fora da lista de propriedade -> 403", r.s === 403, res(r));
r = await call(req("ptest-x", { instance: "outra" }));
check("instância não permitida -> 403", r.s === 403, res(r));

// ---------- domínio ----------
r = await call(req("ptest-naoexiste"));
check(
  "sessão inexistente -> indisponivel",
  r.s === 200 && r.b?.resultado === "indisponivel",
  res(r),
);

// T11: sessão já com proxy que está LIVRE no pool (3) -> registra e confirma reutilizado
await novaSessao("ptest-h", {
  proxy: {
    server: "proxy-sintetico-3.invalid:8080",
    username: "usr3",
    password: "senha-sintetica-3",
  },
});
r = await call(req("ptest-h"));
check(
  "proxy existente e livre no pool é registrado",
  r.b?.resultado === "confirmado" &&
    r.b?.reutilizado === true &&
    r.b?.server === "proxy-sintetico-3.invalid:8080",
  res(r),
);
let s = await lerSessao("ptest-h");
check(
  "  sessão ptest-h segue STOPPED, mesmo IP",
  s.status === "STOPPED" && s.server === "proxy-sintetico-3.invalid:8080",
  `${s.status} ${s.server}`,
);

// T5: sessão sem proxy, config preexistente preservada
await novaSessao("ptest-a", { metadata: { dono: "teste-a" }, webhooks: [] });
const antes = await lerSessao("ptest-a");
r = await call(req("ptest-a"));
check(
  "sessão sem proxy recebe proxy do pool",
  r.b?.resultado === "confirmado" &&
    r.b?.reutilizado === false &&
    /^proxy-sintetico-\d\.invalid:8080$/.test(r.b?.server ?? ""),
  res(r),
);
const srvA = r.b?.server;
s = await lerSessao("ptest-a");
check(
  "  WAHA: STOPPED (sem start/restart) e config.proxy gravado",
  s.status === "STOPPED" && s.server === srvA,
  `${s.status} ${s.server}`,
);
check(
  "  WAHA: resto da config preservado (metadata)",
  JSON.stringify(s.config?.metadata) === JSON.stringify(antes.config?.metadata),
  JSON.stringify(s.config?.metadata),
);
check("  resposta sem credenciais", !/usr\d|senha-sintetica/.test(JSON.stringify(r.b)), "");

// T6: repetição com a MESMA identidade (operation_id novo) devolve o mesmo proxy
r = await call(req("ptest-a"));
check(
  "repetição devolve o mesmo proxy (reutilizado)",
  r.b?.resultado === "confirmado" && r.b?.reutilizado === true && r.b?.server === srvA,
  res(r),
);

// T7: segunda sessão pega outro; terceira esgota o pool
await novaSessao("ptest-b");
r = await call(req("ptest-b"));
check(
  "segunda sessão recebe OUTRO proxy",
  r.b?.resultado === "confirmado" && r.b?.server && r.b.server !== srvA,
  res(r),
);
await novaSessao("ptest-c");
r = await call(req("ptest-c"));
check("pool esgotado", r.s === 200 && r.b?.resultado === "pool_esgotado", res(r));
s = await lerSessao("ptest-c");
check(
  "  sessão ptest-c intocada (sem proxy)",
  s.status === "STOPPED" && !s.server,
  `${s.status} ${s.server}`,
);

// T8/T9: conflitos
await novaSessao("ptest-e", { proxy: { server: srvA, username: "u", password: "p" } });
r = await call(req("ptest-e"));
check(
  "proxy de outra sessão -> conflito",
  r.b?.resultado === "conflito" && r.b?.codigo === "proxy_de_outra_sessao",
  res(r),
);
s = await lerSessao("ptest-e");
check("  sessão ptest-e não teve o IP trocado", s.server === srvA, s.server);
await novaSessao("ptest-f", {
  proxy: { server: "fora-do-pool.invalid:9999", username: "u", password: "p" },
});
r = await call(req("ptest-f"));
check(
  "proxy fora do pool -> conflito divergente",
  r.b?.resultado === "conflito" && r.b?.codigo === "divergente_do_pool",
  res(r),
);
s = await lerSessao("ptest-f");
check("  sessão ptest-f não teve o IP trocado", s.server === "fora-do-pool.invalid:9999", s.server);

// T10: sessão não parada
await novaSessao("ptest-g");
const st = await waha("POST", "/api/sessions/ptest-g/start");
await new Promise((ok) => setTimeout(ok, 4000));
const sg = await lerSessao("ptest-g");
r = await call(req("ptest-g"));
check(
  "sessão não parada -> conflito sessao_nao_parada",
  sg.status !== "STOPPED"
    ? r.b?.resultado === "conflito" && r.b?.codigo === "sessao_nao_parada"
    : true,
  `start=${st.s} status=${sg.status} ${res(r)}`,
);
await waha("POST", "/api/sessions/ptest-g/stop");

console.log(falhas === 0 ? "\nTODOS OS CASOS OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
