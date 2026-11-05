const K = process.env.K,
  T = process.env.T,
  N = "http://n8n_webhook:5678/webhook/proxytest/provisiona-proxy-v1";
const waha = async (m, p, b) => {
  const r = await fetch("http://localhost:3000" + p, {
    method: m,
    headers: { "X-Api-Key": K, "Content-Type": "application/json" },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const call = async (n) => {
  const t = Date.now();
  const r = await fetch(N, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + T },
    body: JSON.stringify({
      instance: "principal",
      session_name: n,
      operation_id: crypto.randomUUID(),
    }),
  });
  return { s: r.status, b: await r.json().catch(() => null), ms: Date.now() - t };
};
const modo = process.argv[2];
if (modo === "criar") {
  await waha("POST", "/api/sessions", { name: process.argv[3], start: false, config: {} });
  console.log("criada", process.argv[3]);
}
if (modo === "chamar") {
  const r = await call(process.argv[3]);
  console.log(
    JSON.stringify({ http: r.s, resultado: r.b?.resultado, codigo: r.b?.codigo, ms: r.ms }),
  );
}
if (modo === "ler") {
  const r = await waha("GET", "/api/sessions/" + process.argv[3]);
  console.log(JSON.stringify({ status: r.b?.status, server: r.b?.config?.proxy?.server }));
}
