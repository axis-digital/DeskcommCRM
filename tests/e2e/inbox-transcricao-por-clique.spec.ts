import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { bufToBytea, encryptKey } from "@/lib/crypto/aes_gcm";
import { expect, test } from "./helpers/test";

test("áudio humano só transcreve após o clique, mostra 402 e permite nova tentativa", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toBe("127.0.0.1");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const sufixo = randomUUID();
  const email = `transcricao-${sufixo}@example.com`;
  const password = `Teste-${randomUUID()}!`;
  const evidence = path.join(process.cwd(), "evidence/transcricao-sob-demanda");
  mkdirSync(evidence, { recursive: true });
  let userId = "";
  let orgId = "";
  let mediaPath = "";
  try {
    const { data: user, error: eu } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (eu || !user.user) throw new Error("fixture_transcricao_usuario");
    userId = user.user.id;
    const { data: org, error: eo } = await admin
      .from("organizations")
      .insert({
        slug: `e2e-transcricao-clique-${sufixo}`,
        display_name: "Empresa de teste de transcrição",
        legal_name: "Empresa de teste",
        status: "active",
        created_by: userId,
        onboarded_at: new Date().toISOString(),
        settings: { llm: { provider: "openrouter", default_model: "google/gemini-2.5-flash" } },
      })
      .select("id")
      .single();
    if (eo || !org) throw new Error("fixture_transcricao_org");
    orgId = org.id;
    const { error: em } = await admin.from("user_organizations").insert({
      organization_id: orgId,
      user_id: userId,
      role: "manager",
      accepted_at: new Date().toISOString(),
    });
    if (em) throw new Error("fixture_transcricao_vinculo");
    const chave = encryptKey("e2e-transcricao-chave-sintetica");
    const { error: ek } = await admin.from("ai_provider_credentials").insert({
      organization_id: orgId,
      provider: "openrouter",
      label: "Servidor sintético de teste",
      api_key_encrypted: bufToBytea(chave.ciphertext),
      api_key_iv: bufToBytea(chave.iv),
      api_key_tag: bufToBytea(chave.tag),
      api_key_last4: chave.last4,
      is_active: true,
      created_by: userId,
      validated_at: new Date().toISOString(),
    });
    if (ek) throw new Error("fixture_transcricao_chave_sintetica");
    const { data: canal, error: ec } = await admin
      .from("channel_sessions")
      .insert({
        organization_id: orgId,
        waha_session_name: `transcricao-${sufixo}`,
        display_name: "Canal de teste",
        status: "WORKING",
        webhook_secret_encrypted: "\\x00",
      })
      .select("id")
      .single();
    if (ec || !canal) throw new Error("fixture_transcricao_canal");
    const { data: contato, error: ep } = await admin
      .from("contacts")
      .insert({
        organization_id: orgId,
        display_name: "Contato sintético de áudio",
      })
      .select("id")
      .single();
    if (ep || !contato) throw new Error("fixture_transcricao_contato");
    const { data: conversa, error: ev } = await admin
      .from("conversations")
      .insert({
        organization_id: orgId,
        channel_session_id: canal.id,
        contact_id: contato.id,
        status: "claimed",
        assigned_to_user_id: userId,
        assigned_at: new Date().toISOString(),
        bot_silenced_until: "infinity",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (ev || !conversa) throw new Error("fixture_transcricao_conversa");
    const messageId = randomUUID();
    mediaPath = `${orgId}/${conversa.id}/${messageId}.ogg`;
    const ogg = execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-c:a",
      "libopus",
      "-f",
      "ogg",
      "pipe:1",
    ]);
    const uploaded = await admin.storage
      .from("whatsapp-media")
      .upload(mediaPath, ogg, { contentType: "audio/ogg" });
    if (uploaded.error) throw new Error("fixture_transcricao_storage");
    const { error: ea } = await admin.from("messages").insert({
      id: messageId,
      organization_id: orgId,
      conversation_id: conversa.id,
      channel_session_id: canal.id,
      contact_id: contato.id,
      direction: "inbound",
      type: "audio",
      status: "received",
      media_mime: "audio/ogg",
      media_storage_path: mediaPath,
      media_derived_status: "skipped",
      metadata: { media_status: "stored" },
      sent_at: new Date().toISOString(),
    });
    if (ea) throw new Error("fixture_transcricao_audio");
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(/\/app\//);
    await page.goto(`/app/inbox/${conversa.id}`);
    const transcrever = page.getByRole("button", { name: "Transcrever", exact: true });
    await expect(transcrever).toBeVisible();
    await expect(page.getByTestId("transcricao-de-audio-pendente")).toHaveCount(0);
    const antes = await admin
      .from("event_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("entity_id", messageId)
      .eq("event_type", "media.derive_requested");
    expect(antes.count).toBe(0);
    await page.screenshot({ path: path.join(evidence, "01-transcrever.png"), fullPage: true });
    const primeiroPedido = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/messages/${messageId}/transcription`) && r.request().method() === "POST",
    );
    await transcrever.click();
    expect((await primeiroPedido).status()).toBe(202);
    await expect(page.getByTestId("transcricao-de-audio-pendente")).toBeVisible();
    const executar = (modo: string) =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/e2e-transcricao-por-clique.ts",
          orgId,
          messageId,
          modo,
          info.outputPath(`worker-${modo}.json`),
        ],
        { env: process.env, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] },
      );
    executar("402");
    await expect(page.getByRole("alert").filter({ hasText: /saldo|créditos/ })).toBeVisible();
    await page.screenshot({ path: path.join(evidence, "02-falha-de-credito.png"), fullPage: true });
    const novaTentativa = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/messages/${messageId}/transcription`) && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    expect((await novaTentativa).status()).toBe(202);
    await expect(page.getByTestId("transcricao-de-audio-pendente")).toBeVisible();
    executar("ok");
    await expect(page.getByTestId("transcricao-de-audio")).toContainText(
      "Texto sintético: gostaria de agendar uma reunião.",
    );
    await page.screenshot({
      path: path.join(evidence, "03-transcricao-pronta.png"),
      fullPage: true,
    });
    await page.reload();
    await expect(page.getByTestId("transcricao-de-audio")).toBeVisible();
    const depois = await admin
      .from("event_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("entity_id", messageId)
      .eq("event_type", "media.derive_requested");
    expect(depois.count).toBe(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(evidence, "04-celular.png"), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await page.goto("about:blank").catch(() => undefined);
    if (mediaPath) await admin.storage.from("whatsapp-media").remove([mediaPath]);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
