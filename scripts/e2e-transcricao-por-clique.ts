/** Worker real; só o fornecedor de áudio é um servidor HTTP sintético local. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { EventRow } from "@/lib/event-log/dispatcher";

const [, , orgId, messageId, modo, recibo] = process.argv;
let etapa = "precondicoes";
async function main() {
  assert(orgId && messageId && recibo && ["ok", "402"].includes(modo ?? ""));
  assert(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname === "127.0.0.1");
  assert(new URL(process.env.SUPABASE_DB_URL!).hostname === "127.0.0.1");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  etapa = "organizacao";
  const { data: org } = await admin.from("organizations").select("slug").eq("id", orgId).single();
  assert(org?.slug.startsWith("e2e-transcricao-clique-"));
  etapa = "pedido_confirmado";
  const { data: evento } = await admin
    .from("event_log")
    .select("*")
    .eq("organization_id", orgId)
    .eq("entity_id", messageId)
    .eq("event_type", "media.derive_requested")
    .eq("status", "pending")
    .single();
  assert(evento?.payload.transcricao_manual === true);
  let chamadas = 0;
  const server = createServer((req, res) => {
    void (async () => {
      assert(req.url === "/api/v1/audio/transcriptions");
      assert(req.headers.authorization === "Bearer e2e-transcricao-chave-sintetica");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const form = await new Response(Buffer.concat(chunks), {
        headers: { "content-type": req.headers["content-type"]! },
      }).formData();
      assert(form.get("file") instanceof File);
      chamadas++;
      res.writeHead(modo === "ok" ? 200 : 402, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          modo === "ok"
            ? {
                text: "Texto sintético: gostaria de agendar uma reunião.",
                usage: { seconds: 1, cost: 0.0005 },
              }
            : { error: { message: "synthetic insufficient credits" } },
        ),
      );
    })().catch(() => res.writeHead(400).end());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${address.port}/api/v1`;
  for (const key of [
    "OPENAI_API_KEY",
    "TRANSCRIPTION_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY",
  ])
    process.env[key] = "";
  try {
    const { deriveMessageMedia, MEDIA_DERIVE_CONSUMER_KEY } =
      await import("@/workers/media-derive-worker");
    // No caso 402, exercita a falha terminal sem esperar cinco backoffs do cron.
    etapa = "execucao_do_worker";
    const resultado = await deriveMessageMedia({
      ...evento,
      attempts: modo === "402" ? 4 : 0,
    } as EventRow);
    etapa = `resultado_${resultado.status}_chamadas_${chamadas}`;
    assert(resultado.status === (modo === "ok" ? "ok" : "error"));
    assert(chamadas === 1);
    const { error } = await admin
      .from("event_log")
      .update({ status: modo === "ok" ? "done" : "dead", consumed_by: [MEDIA_DERIVE_CONSUMER_KEY] })
      .eq("id", evento.id)
      .eq("organization_id", orgId);
    assert(!error);
    writeFileSync(
      recibo,
      JSON.stringify({
        workerReal: true,
        storageReal: true,
        fornecedor: "HTTP local sintético",
        chamadas,
        modo,
      }),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main()
  .then(() => process.exit(0))
  .catch(() => {
    process.stderr.write(
      `Falha no worker de teste em ${etapa}; nenhuma credencial ou conteúdo real foi utilizado.\n`,
    );
    process.exit(1);
  });
