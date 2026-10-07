/**
 * CONVERSÕES NO GA4 — provado PELA TELA, com receptor HTTP real (DoD 12).
 *
 * O caminho inteiro de um visitante do site até o evento chegar ao GA4:
 *
 *   1. o dono liga o GA4 em Configurações › Conversões e testa a conexão — o
 *      receptor recebe `/debug/mp/collect`;
 *   2. o script do site passa a levar `data-ga4`;
 *   3. o visitante (cookie `_ga`) clica no WhatsApp do site; o clique leva o
 *      `client_id` junto e vira um `[ref:XXXXXX]` no texto;
 *   4. a primeira mensagem entra pela rota de produção do WAHA, o ref casa e o
 *      contato ganha a identidade GA4;
 *   5. o negócio é marcado como ganho no kanban, o dreno roda, e o receptor
 *      recebe `/mp/collect` com o `client_id` do cookie e o valor da venda;
 *   6. o Histórico mostra "Venda (GA4)".
 *
 * O receptor faz o papel do Google: o app sob teste sobe com
 * `GA4_MP_BASE_URL=http://127.0.0.1:4599`. Nada sai para o Google real.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { createServer, type Server } from "node:http";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { expect, test, type Page } from "./helpers/test";

test.describe.configure({ timeout: 120_000 });

const PORTA_DO_RECEPTOR = 4599;
const MEASUREMENT_ID = "G-PROVA1234";
const CLIENT_ID = "123456789.1700000000";
const SESSION_ID = "1700000001";
const EVIDENCIA = path.join(process.cwd(), "evidence/conversoes-ga4");

const { url, serviceRole } = credenciaisSupabaseDeTeste();
const admin = createClient<Database>(url, serviceRole, { auth: { persistSession: false } });

interface Recebido {
  caminho: string;
  corpo: Record<string, unknown> | null;
}
const recebidos: Recebido[] = [];
let receptor: Server;

test.beforeAll(async () => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  receptor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      recebidos.push({ caminho: req.url ?? "", corpo: corpo ? JSON.parse(corpo) : null });
      if (req.url?.startsWith("/debug/mp/collect")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ validationMessages: [] }));
        return;
      }
      res.statusCode = 204;
      res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    receptor.once("error", reject);
    receptor.listen(PORTA_DO_RECEPTOR, "127.0.0.1", resolve);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => receptor.close(() => resolve()));
});

/** O webhook do WAHA e o funil de entrada vêm do seed do nascimento do lead. */
function credsDoNascimento(): {
  webhook_token: string;
  session_name: string;
  pipeline_default_id: string;
  org_id: string;
} {
  const caminho = path.join(process.cwd(), ".e2e-creds.json");
  let creds = JSON.parse(fs.readFileSync(caminho, "utf8"));
  if (!creds.nascimento?.webhook_token) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-nascimento-do-lead.ts"], { stdio: "inherit" });
    creds = JSON.parse(fs.readFileSync(caminho, "utf8"));
  }
  return { ...creds.nascimento, org_id: creds.org_id };
}

function segredoInterno(): string {
  const segredo = (process.env.INTERNAL_CRON_SECRET || process.env.INTERNAL_SECRET)?.trim();
  if (!segredo) throw new Error("INTERNAL_SECRET ausente no ambiente do e2e");
  return segredo;
}

async function drena(page: Page): Promise<void> {
  const r = await page.request.post("/api/v1/cron/event-log-drain", {
    headers: { authorization: `Bearer ${segredoInterno()}` },
  });
  expect(r.status(), "o dreno tem de responder 200").toBe(200);
}

test("dono liga o GA4, testa a conexão, e o ganho chega ao GA4 com o client_id do site", async ({
  page,
}) => {
  await loginComoAdmin(page, lerCreds());
  const nascimento = credsDoNascimento();
  const org = nascimento.org_id;

  const { data: conexaoAnterior } = await admin
    .from("ad_platform_connections")
    .select("*")
    .eq("organization_id", org)
    .eq("platform", "ga4")
    .maybeSingle();
  const { data: capturaAnterior } = await admin
    .from("google_ads_landing_pages")
    .select("*")
    .eq("organization_id", org)
    .maybeSingle();

  const gclid = `e2e-ga4-${randomUUID()}`;
  const sufixo = String(Date.now()).slice(-7);
  const telefone = `55319${sufixo}`;
  const nome = `Cliente GA4 ${sufixo}`;
  let site: Server | undefined;
  let contatoId: string | null = null;

  try {
    // ── 1. Ligar o GA4 pela tela ───────────────────────────────────────────
    await page.goto("/app/settings/conversoes");
    const ga4 = page.getByTestId("conexao-ga4");
    await ga4.getByLabel("Measurement ID", { exact: true }).fill(MEASUREMENT_ID);
    await ga4.getByLabel("API secret", { exact: true }).fill("segredo-de-prova-123");
    const ligado = ga4.getByRole("switch", { name: "Enviar ao GA4", exact: true });
    if ((await ligado.getAttribute("aria-checked")) !== "true") await ligado.click();
    await ga4.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Conexão com o GA4 salva.", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCIA, "01-conexao-salva.png"), fullPage: true });

    await ga4.getByRole("button", { name: "Testar conexão", exact: true }).click();
    await expect(page.getByText("O GA4 aceitou o evento de teste.", { exact: true })).toBeVisible();
    expect(
      recebidos.some((r) =>
        r.caminho.startsWith(`/debug/mp/collect?measurement_id=${MEASUREMENT_ID}`),
      ),
      "o teste da conexão tem de chegar ao receptor",
    ).toBe(true);

    // ── 2. Endereço de captura do Google e script do site com data-ga4 ─────
    const captura = page.getByTestId("captura-google");
    await captura.getByLabel("Para qual WhatsApp mandar", { exact: true }).fill("+5511999999999");
    await captura
      .getByLabel("Texto que a pessoa vai enviar", { exact: true })
      .fill("Olá! Quero saber mais. [ref:{token}]");
    const capturaLigada = captura.getByRole("switch", {
      name: "Endereço de captura ligado",
      exact: true,
    });
    if ((await capturaLigada.getAttribute("aria-checked")) !== "true") await capturaLigada.click();
    await captura.getByRole("button", { name: "Salvar endereço de captura", exact: true }).click();
    await expect(page.getByText("Endereço de captura salvo.", { exact: true })).toBeVisible();
    await page.reload();

    const snippet = await page.getByTestId("script-do-site").locator("code").innerText();
    expect(snippet, "com o GA4 ligado o script do site leva o Measurement ID").toContain(
      `data-ga4="${MEASUREMENT_ID}"`,
    );
    const link = (await captura.locator("code").innerText()).trim();

    // ── 3. O visitante do site, com cookie _ga, clica no WhatsApp ─────────
    let destino = "";
    await page.route(
      (u) => u.href.startsWith(`${link}?`),
      async (route) => {
        const resposta = await route.fetch({ maxRedirects: 0 });
        destino = resposta.headers()["location"] ?? "";
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<h1>Destino WhatsApp de teste</h1>",
        });
      },
    );
    await page.context().route("https://wa.me/**", (route) => route.abort());

    site = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><head>${snippet}</head><body><h1>Site de teste</h1><a id="whatsapp" href="https://wa.me/5511999999999">WhatsApp</a></body></html>`,
      );
    });
    await new Promise<void>((resolve, reject) => {
      site!.once("error", reject);
      site!.listen(0, "127.0.0.1", resolve);
    });
    const endereco = site.address();
    if (!endereco || typeof endereco === "string") throw new Error("Site de teste sem porta");
    const origemDoSite = `http://127.0.0.1:${endereco.port}`;
    await page.context().addCookies([
      { name: "_ga", value: `GA1.1.${CLIENT_ID}`, url: origemDoSite },
      {
        name: `_ga_${MEASUREMENT_ID.slice(2)}`,
        value: `GS1.1.${SESSION_ID}.1.0.1700000001.0.0.0`,
        url: origemDoSite,
      },
    ]);
    await page.goto(`${origemDoSite}/?gclid=${gclid}`);
    await page.getByRole("link", { name: "WhatsApp", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Destino WhatsApp de teste", exact: true }),
    ).toBeVisible();
    const texto = new URL(destino).searchParams.get("text") ?? "";
    expect(texto, "o texto do WhatsApp leva o ref do clique").toMatch(/\[ref:[2-9A-HJ-NP-Z]{6}\]/);

    // ── 4. A primeira mensagem entra pela rota de produção do WAHA ─────────
    const webhook = await page.request.post(`/api/v1/webhooks/waha/${nascimento.webhook_token}`, {
      data: {
        event: "message",
        session: nascimento.session_name,
        payload: {
          id: `e2e-ga4-${sufixo}`,
          from: `${telefone}@c.us`,
          fromMe: false,
          body: texto,
          timestamp: Math.floor(Date.now() / 1000),
          _data: { notifyName: nome },
        },
      },
    });
    expect(webhook.status(), "o webhook precisa aceitar a mensagem").toBe(200);

    await expect
      .poll(
        async () => {
          // Pela mensagem, não pelo telefone: a ingestão normaliza o celular
          // brasileiro (nono dígito), e o número gravado não é o que entrou.
          const { data: mensagem } = await admin
            .from("messages")
            .select("contact_id")
            .eq("organization_id", org)
            .eq("body", texto)
            .maybeSingle();
          if (!mensagem?.contact_id) return null;
          const { data } = await admin
            .from("contacts")
            .select("id, source_metadata")
            .eq("organization_id", org)
            .eq("id", mensagem.contact_id)
            .maybeSingle();
          contatoId = data?.id ?? null;
          const meta = (data?.source_metadata ?? {}) as {
            ad_raw?: { ga?: Record<string, unknown> };
          };
          return meta.ad_raw?.ga ?? null;
        },
        { message: "o contato tem de ganhar a identidade GA4 do clique", timeout: 20_000 },
      )
      .toEqual({ ga_client_id: CLIENT_ID, ga_session_id: SESSION_ID });

    // O valor é dado de cadastro do negócio, não o que está sob prova aqui.
    const { data: lead, error: erroLead } = await admin
      .from("crm_leads")
      .update({ value_cents: 15000, currency: "BRL" })
      .eq("organization_id", org)
      .eq("contact_id", contatoId!)
      .select("id, title")
      .single();
    if (erroLead) throw erroLead;

    // ── 5. Ganho no kanban, dreno, e o receptor recebe o evento ───────────
    await page.goto(`/app/pipelines/${nascimento.pipeline_default_id}`);
    const card = page.getByRole("group", { name: `Lead: ${lead.title}`, exact: true });
    await expect(card, "o card do contato tem de estar no funil").toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: "Ações do lead", exact: true }).click();
    await page.getByRole("menuitem", { name: "Marcar como ganho", exact: true }).click();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("crm_leads")
            .select("status")
            .eq("id", lead.id)
            .single();
          return data?.status;
        },
        { timeout: 15_000 },
      )
      .toBe("won");

    await drena(page);
    await expect
      .poll(() => recebidos.find((r) => r.caminho.startsWith("/mp/collect"))?.corpo ?? null, {
        message: "o ganho tem de chegar ao GA4",
        timeout: 20_000,
      })
      .toMatchObject({
        client_id: CLIENT_ID,
        events: [
          {
            name: "close_convert_lead",
            params: expect.objectContaining({
              session_id: SESSION_ID,
              value: 150,
              currency: "BRL",
            }),
          },
        ],
      });

    // ── 6. O Histórico mostra a venda enviada ao GA4 ──────────────────────
    await page.goto("/app/settings/conversoes");
    await page.getByRole("link", { name: "Histórico de envios", exact: true }).click();
    const historico = page.getByTestId("historico-de-envios");
    const linha = historico.getByRole("listitem").filter({ hasText: "Venda (GA4)" }).first();
    await expect(linha).toBeVisible();
    await expect(linha).toContainText("Entregue");
    await page.screenshot({ path: path.join(EVIDENCIA, "02-historico.png"), fullPage: true });
  } finally {
    if (site?.listening) await new Promise<void>((resolve) => site!.close(() => resolve()));
    if (contatoId) {
      const { data: leads } = await admin
        .from("crm_leads")
        .select("id")
        .eq("organization_id", org)
        .eq("contact_id", contatoId);
      const ids = (leads ?? []).map((l) => l.id);
      if (ids.length > 0) {
        await admin
          .from("ad_conversion_dispatches")
          .delete()
          .eq("organization_id", org)
          .in("lead_id", ids);
        await admin.from("event_log").delete().eq("organization_id", org).in("entity_id", ids);
        await admin.from("crm_leads").delete().eq("organization_id", org).in("id", ids);
      }
    }
    await admin
      .from("google_ads_click_refs")
      .delete()
      .eq("organization_id", org)
      .eq("gclid", gclid);
    if (conexaoAnterior) await admin.from("ad_platform_connections").upsert(conexaoAnterior);
    else
      await admin
        .from("ad_platform_connections")
        .delete()
        .eq("organization_id", org)
        .eq("platform", "ga4");
    if (capturaAnterior) await admin.from("google_ads_landing_pages").upsert(capturaAnterior);
    else await admin.from("google_ads_landing_pages").delete().eq("organization_id", org);
  }
});

test("dono liga e desliga o envio de vendas sem origem, e a escolha sobrevive ao recarregar", async ({
  page,
}) => {
  await loginComoAdmin(page, lerCreds());
  const org = credsDoNascimento().org_id;
  const { data: antes } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org)
    .single();
  try {
    await page.goto("/app/settings/conversoes");
    const chave = page.getByRole("switch", {
      name: "Enviar vendas de contatos sem anúncio nem site",
      exact: true,
    });
    await expect(chave, "vem desligado").toHaveAttribute("aria-checked", "false");
    await chave.click();
    await expect(page.getByText("Conexão salva.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(chave, "a escolha sobrevive ao recarregar").toHaveAttribute(
      "aria-checked",
      "true",
    );
    await chave.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(EVIDENCIA, "03-venda-sem-origem-ligada.png"),
      fullPage: true,
    });

    const { data: depois } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", org)
      .single();
    expect(
      (depois?.settings as { conversions?: Record<string, unknown> }).conversions
        ?.enviar_sem_origem,
    ).toBe(true);
    const { data: auditoria } = await admin
      .from("api_audit_log")
      .select("action")
      .eq("organization_id", org)
      .eq("action", "conversions.enviar_sem_origem_updated");
    expect(auditoria?.length ?? 0, "ligar é auditado").toBeGreaterThan(0);

    await chave.click();
    await expect(chave).toHaveAttribute("aria-checked", "false");
  } finally {
    await admin
      .from("organizations")
      .update({ settings: antes?.settings ?? {} })
      .eq("id", org);
  }
});

test("dono troca o evento do ganho para purchase pela tela, e a escolha é gravada e auditada", async ({
  page,
}) => {
  await loginComoAdmin(page, lerCreds());
  const org = credsDoNascimento().org_id;
  const { data: conexaoAnterior } = await admin
    .from("ad_platform_connections")
    .select("*")
    .eq("organization_id", org)
    .eq("platform", "ga4")
    .maybeSingle();
  try {
    await page.goto("/app/settings/conversoes");
    const ga4 = page.getByTestId("conexao-ga4");
    await ga4.getByLabel("Measurement ID", { exact: true }).fill(MEASUREMENT_ID);
    await ga4.getByLabel("API secret", { exact: true }).fill("segredo-de-prova-123");
    const evento = ga4.getByLabel("Evento enviado na venda", { exact: true });
    await evento.selectOption("purchase");
    await expect(
      ga4.getByText(
        "O id do negócio vai como transaction_id, e o GA4 não conta a mesma venda duas vezes.",
        { exact: true },
      ),
    ).toBeVisible();
    await ga4.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Conexão com o GA4 salva.", { exact: true })).toBeVisible();

    await page.reload();
    await expect(evento, "a escolha sobrevive ao recarregar").toHaveValue("purchase");
    await evento.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(EVIDENCIA, "04-evento-do-ganho-purchase.png"),
      fullPage: true,
    });

    const { data: depois } = await admin
      .from("ad_platform_connections")
      .select("ga4_won_event")
      .eq("organization_id", org)
      .eq("platform", "ga4")
      .single();
    expect(depois?.ga4_won_event).toBe("purchase");
    const { data: auditoria } = await admin
      .from("api_audit_log")
      .select("metadata")
      .eq("organization_id", org)
      .eq("action", "ad_platform_connection.updated");
    expect(
      (auditoria ?? []).some(
        (a) => (a.metadata as { won_event?: string } | null)?.won_event === "purchase",
      ),
      "a troca é auditada com o evento escolhido",
    ).toBe(true);
  } finally {
    if (conexaoAnterior) await admin.from("ad_platform_connections").upsert(conexaoAnterior);
    else
      await admin
        .from("ad_platform_connections")
        .delete()
        .eq("organization_id", org)
        .eq("platform", "ga4");
  }
});

test("painel de regras sugeridas cria só as regras marcadas e nunca troca a que já existe", async ({
  page,
}) => {
  await loginComoAdmin(page, lerCreds());
  const org = credsDoNascimento().org_id;
  const sufixo = String(Date.now()).slice(-7);
  const { data: conexaoAnterior } = await admin
    .from("ad_platform_connections")
    .select("*")
    .eq("organization_id", org)
    .eq("platform", "ga4")
    .maybeSingle();

  // Um funil de produto só deste teste: as sugestões saem do objetivo do funil
  // e do passo (`agent_stage_hint`) de cada etapa.
  const { data: funil, error: erroFunil } = await admin
    .from("crm_pipelines")
    .insert({
      organization_id: org,
      name: `Loja E2E ${sufixo}`,
      slug: `loja-e2e-${sufixo}`,
      settings: { fields: [], canonical_tags: [], lost_reasons: [], objetivo: "vender_produto" },
    })
    .select("id")
    .single();
  if (erroFunil) throw erroFunil;
  const etapa = (nome: string, passo: string, posicao: number) => ({
    organization_id: org,
    pipeline_id: funil.id,
    name: nome,
    slug: `${passo}-${sufixo}`,
    position: posicao,
    agent_stage_hint: passo,
    is_lost: passo === "lost",
  });

  try {
    const { data: etapas, error: erroEtapas } = await admin
      .from("crm_stages")
      .insert([
        etapa("Novo", "new", 1),
        etapa("Respondido", "contacted", 2),
        etapa("Escolhendo", "qualifying", 3),
        etapa("Vai levar", "qualified", 4),
        etapa("Desistiu", "lost", 5),
      ])
      .select("id, agent_stage_hint");
    if (erroEtapas) throw erroEtapas;
    const id = (passo: string) => etapas.find((e) => e.agent_stage_hint === passo)!.id;

    // Regra escolhida à mão antes: o painel não pode trocá-la.
    await admin.from("ga4_conversion_rules").insert({
      organization_id: org,
      stage_id: id("new"),
      event_name: `GA4Etapa:${id("new")}`,
      ga4_event: "qualify_lead",
      enabled: false,
    });

    // O painel só aparece com a conexão GA4 configurada.
    await page.goto("/app/settings/conversoes");
    const ga4 = page.getByTestId("conexao-ga4");
    await ga4.getByLabel("Measurement ID", { exact: true }).fill(MEASUREMENT_ID);
    await ga4.getByLabel("API secret", { exact: true }).fill("segredo-de-prova-123");
    await ga4.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Conexão com o GA4 salva.", { exact: true })).toBeVisible();
    await page.reload();

    const painel = page.getByTestId(`sugestoes-ga4-${funil.id}`);
    await expect(painel).toContainText("Vender produtos");
    await expect(painel.getByTestId(`sugestao-ga4-${id("new")}`)).toContainText("já configurada");
    await expect(painel.getByTestId(`sugestao-ga4-${id("new")}`).getByRole("checkbox")).toHaveCount(
      0,
    );
    await expect(
      painel.getByTestId(`sugestao-ga4-${id("contacted")}`),
      "respondido não sugere",
    ).toHaveCount(0);
    await expect(painel.getByTestId(`sugestao-ga4-${id("qualifying")}`)).toContainText("view_item");
    await expect(painel.getByTestId(`sugestao-ga4-${id("lost")}`)).toContainText(
      "close_unconvert_lead",
    );

    const vaiLevar = painel.getByTestId(`sugestao-ga4-${id("qualified")}`).getByRole("checkbox");
    await expect(vaiLevar, "vem pré-marcada").toBeChecked();
    await vaiLevar.uncheck();
    await painel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(EVIDENCIA, "05-regras-sugeridas.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Aplicar sugestões", exact: true }).click();
    await expect(page.getByText("2 regra(s) criada(s).", { exact: true })).toBeVisible();

    const { data: regras } = await admin
      .from("ga4_conversion_rules")
      .select("stage_id, ga4_event, enabled")
      .eq("organization_id", org)
      .in(
        "stage_id",
        etapas.map((e) => e.id),
      );
    const porEtapa = new Map((regras ?? []).map((r) => [r.stage_id, r]));
    expect(porEtapa.get(id("qualifying"))).toMatchObject({ ga4_event: "view_item", enabled: true });
    expect(porEtapa.get(id("lost"))).toMatchObject({
      ga4_event: "close_unconvert_lead",
      enabled: true,
    });
    expect(porEtapa.has(id("qualified")), "desmarcada não vira regra").toBe(false);
    expect(porEtapa.get(id("new")), "a regra existente não é trocada").toMatchObject({
      ga4_event: "qualify_lead",
      enabled: false,
    });

    const { data: auditoria } = await admin
      .from("api_audit_log")
      .select("metadata")
      .eq("organization_id", org)
      .eq("action", "ga4_conversion_rules.updated");
    expect(
      (auditoria ?? []).some((a) => {
        const m = a.metadata as { origem?: string; criadas?: number } | null;
        return m?.origem === "regras_sugeridas" && m.criadas === 2;
      }),
      "aplicar é auditado com a contagem criada",
    ).toBe(true);

    await page.reload();
    await expect(
      page.getByTestId(`sugestao-ga4-${id("qualifying")}`).getByText("já configurada"),
    ).toBeVisible();
  } finally {
    await admin
      .from("ga4_conversion_rules")
      .delete()
      .eq("organization_id", org)
      .in(
        "stage_id",
        ((await admin.from("crm_stages").select("id").eq("pipeline_id", funil.id)).data ?? []).map(
          (e) => e.id,
        ),
      );
    await admin.from("crm_stages").delete().eq("organization_id", org).eq("pipeline_id", funil.id);
    await admin.from("crm_pipelines").delete().eq("organization_id", org).eq("id", funil.id);
    if (conexaoAnterior) await admin.from("ad_platform_connections").upsert(conexaoAnterior);
    else
      await admin
        .from("ad_platform_connections")
        .delete()
        .eq("organization_id", org)
        .eq("platform", "ga4");
  }
});
