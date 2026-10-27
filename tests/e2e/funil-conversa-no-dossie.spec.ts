/**
 * A ABA "FUNIS" ABRE O FUNIL, E O NEGÓCIO RESPONDE A CONVERSA SEM SAIR DO QUADRO.
 *
 * Pedido do dono (15/10/2026): clicar em "Funis" caía numa lista de funis, e
 * clicar no card de um negócio abria um dossiê sem a conversa — para responder o
 * cliente era preciso sair do quadro, achar a conversa na Inbox e voltar.
 *
 * Esta spec dirige a TELA, na ordem em que um operador faria:
 *
 *   1. "Funis" na sidebar abre o quadro do funil PADRÃO (não a lista);
 *   2. troca de funil pelo seletor do título (pílulas até 4 funis, lista acima);
 *   3. clicar no card abre o dossiê com a conversa ao lado;
 *   4. responder pelo dossiê grava a mensagem na conversa de verdade;
 *   5. Esc no campo só tira o foco; o segundo Esc fecha — e o quadro continua
 *      no mesmo funil;
 *   6. o deep link `?lead=` abre o funil DO NEGÓCIO e some da URL ao fechar;
 *   7. no dossiê: o responsável se troca pelo círculo, nome e e-mail do contato
 *      se editam ali, e as seções têm respiro (medido);
 *   8. as medidas, por ferramenta: duas colunas a 1280px (conversa primeiro),
 *      abas Conversa | Negócio a 390px, nada transborda na horizontal.
 *
 * O funil e o negócio são do teste (sufixo único); o funil PADRÃO da aba é o que
 * a organização tem — a spec calcula o esperado com a MESMA regra do produto
 * (`escolherFunilPadrao`) sobre o banco, em vez de assumir um nome.
 */
import { randomInt, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { escolherFunilPadrao } from "../../lib/kanban/funil-padrao";
import { expect, test, type Page } from "./helpers/test";
import { admin, creds, insere, login, registra, type Creds } from "./qa-l12-comum";

const EVIDENCIA = path.join(process.cwd(), "evidence", "funil-conversa-no-dossie");
const SUFIXO = `${Date.now()}`.slice(-7);
const NOME_DO_FUNIL = `Pós-venda QA ${SUFIXO}`;
const TITULO_DO_NEGOCIO = `Negócio funil ${SUFIXO}`;
const RESPOSTA = `Resposta enviada pelo funil ${SUFIXO}`;

let c: Creds;
let funilId = "";
let leadId = "";
let conversaId = "";
let contatoId = "";

async function foto(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}.png`), animations: "disabled" });
}

/** Funis vivos da organização — a população sobre a qual a aba decide. */
async function funisVivos() {
  const { data, error } = await admin
    .from("crm_pipelines")
    .select("id, name, position, is_default, is_archived")
    .eq("organization_id", c.org_id)
    .eq("is_archived", false);
  if (error) throw new Error(error.message);
  return data as Array<{ id: string; name: string; position: number; is_default: boolean; is_archived: boolean }>;
}

test.describe("Funil: a aba abre o padrão e o dossiê responde a conversa", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeAll(async () => {
    c = creds();
    contatoId = await insere("contacts", {
      organization_id: c.org_id,
      name: `Cliente Funil ${SUFIXO}`,
      phone_number: `+5511${randomInt(100000000, 1000000000)}`,
    });
    const canal = await insere("channel_sessions", {
      organization_id: c.org_id,
      waha_session_name: `qa-funil-${randomUUID()}`,
      display_name: "Canal QA funil",
      status: "WORKING",
      webhook_secret_encrypted: "\\x00",
    });
    conversaId = await insere("conversations", {
      organization_id: c.org_id,
      contact_id: contatoId,
      channel_session_id: canal,
      status: "open",
    });
    await insere("messages", {
      organization_id: c.org_id,
      contact_id: contatoId,
      conversation_id: conversaId,
      channel_session_id: canal,
      direction: "inbound",
      type: "text",
      status: "received",
      sent_via: "ai",
      body: "Oi, queria saber do meu pedido",
      sent_at: new Date().toISOString(),
    });
    funilId = await insere("crm_pipelines", {
      organization_id: c.org_id,
      name: NOME_DO_FUNIL,
      slug: `qa-funil-${SUFIXO}`,
    });
    const etapa = await insere("crm_stages", {
      organization_id: c.org_id,
      pipeline_id: funilId,
      name: "Acompanhamento",
      slug: `acompanhamento-${SUFIXO}`,
      position: 1000,
    });
    leadId = await insere("crm_leads", {
      organization_id: c.org_id,
      pipeline_id: funilId,
      stage_id: etapa,
      contact_id: contatoId,
      title: TITULO_DO_NEGOCIO,
      position_in_stage: 1000,
      source: "manual",
    });
  });

  test.afterAll(async () => {
    if (funilId) {
      await admin.from("crm_lead_activities").delete().eq("pipeline_id", funilId);
      await admin.from("crm_leads").delete().eq("pipeline_id", funilId);
      await admin.from("crm_stages").delete().eq("pipeline_id", funilId);
      await admin.from("crm_pipelines").delete().eq("id", funilId);
    }
    await admin.from("messages").delete().eq("conversation_id", conversaId);
    await admin.from("conversations").delete().eq("id", conversaId);
    await admin.from("contacts").delete().eq("id", contatoId);
  });

  test("Funis na sidebar abre o quadro do funil padrão, e a sidebar marca Funis", async ({ page }) => {
    await login(page, c.users.manager!.email, c.password);
    await page.setViewportSize({ width: 1280, height: 768 });
    const padrao = escolherFunilPadrao(await funisVivos());
    expect(padrao, "a organização precisa ter ao menos um funil vivo").not.toBeNull();

    await page.goto("/app/inbox");
    const sidebar = page.getByRole("navigation", { name: "Navegação principal" });
    await sidebar.getByRole("link", { name: "Funis", exact: true }).click();

    await page.waitForURL(new RegExp(`/app/pipelines/${padrao!.id}$`), { timeout: 60_000 });
    await expect(sidebar.getByRole("link", { name: "Funis", exact: true })).toHaveAttribute("aria-current", "page");
    // A lista de gestão continua a um clique, com o nome novo.
    await page.getByRole("link", { name: "Todos os funis" }).click();
    await page.waitForURL(/\/app\/kanban\/funis$/);
    await expect(page.getByRole("heading", { name: "Todos os funis", level: 1 })).toBeVisible();
    registra(`funil-aba · padrão esperado=${padrao!.id} ("${padrao!.name}")`);
  });

  test("troca de funil, abre o negócio, responde pela conversa do dossiê e fecha no mesmo funil", async ({ page }) => {
    await login(page, c.users.manager!.email, c.password);
    await page.setViewportSize({ width: 1280, height: 768 });
    const vivos = await funisVivos();

    await page.goto("/app/kanban");
    await page.waitForURL(/\/app\/pipelines\/[0-9a-f-]+$/, { timeout: 60_000 });

    // Até 4 funis: pílulas-link; acima disso: lista. Os dois ramos são contrato.
    const seletor = page.getByTestId("trocar-funil");
    await expect(seletor).toBeVisible();
    if (vivos.length <= 4) {
      await expect(seletor.locator("a")).toHaveCount(vivos.length);
      await seletor.getByRole("link", { name: NOME_DO_FUNIL }).click();
      await expect(page.getByTestId(`trocar-funil-opcao-${funilId}`)).toHaveAttribute("aria-current", "page");
    } else {
      await seletor.click();
      await page.getByRole("option", { name: NOME_DO_FUNIL }).click();
    }
    await page.waitForURL(new RegExp(`/app/pipelines/${funilId}$`), { timeout: 60_000 });
    const urlDoFunil = page.url();

    await page.getByRole("group", { name: `Lead: ${TITULO_DO_NEGOCIO}` }).click();
    const dossie = page.getByRole("dialog");
    const conversa = dossie.getByRole("region", { name: "Conversa" });
    await expect(conversa).toBeVisible({ timeout: 60_000 });

    const caixa = conversa.getByRole("textbox", { name: "Mensagem" });
    await expect(caixa).toBeVisible();

    // Medida a 1280px (depois de a conversa carregar: antes dela o campo não existe): duas colunas, composer dentro da janela, sem rolar a página.
    const medida = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
      const caixa = document.querySelector('[role="dialog"] textarea[aria-label="Mensagem"]');
      const regiao = document.querySelector('[role="dialog"] section[aria-label="Conversa"]');
      const titulo = document.querySelector('[role="dialog"] h2');
      return {
        larguraDoDossie: d.width,
        composerCabe: caixa ? caixa.getBoundingClientRect().bottom <= window.innerHeight : false,
        conversaAntesDoNegocio:
          regiao && titulo ? regiao.getBoundingClientRect().left < titulo.getBoundingClientRect().left : false,
      };
    });
    registra(`funil-dossie 1280x768 · ${JSON.stringify(medida)}`);
    expect(medida.larguraDoDossie, "a 1280px o dossiê alarga para duas colunas").toBeGreaterThan(900);
    expect(medida.composerCabe, "o composer cabe sem rolar a página").toBe(true);
    expect(medida.conversaAntesDoNegocio, "a conversa é a primeira coluna, o negócio a segunda").toBe(true);

    await caixa.fill(RESPOSTA);
    await caixa.press("Enter");
    await expect(conversa.getByText(RESPOSTA)).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("messages")
          .select("id")
          .eq("conversation_id", conversaId)
          .eq("direction", "outbound")
          .eq("body", RESPOSTA);
        return data?.length ?? 0;
      })
      .toBe(1);
    await foto(page, "01-respondido-no-dossie");

    await page.keyboard.press("Escape"); // 1º Esc: sai do campo
    await expect(dossie).toBeVisible();
    await page.keyboard.press("Escape"); // 2º Esc: fecha o dossiê
    await expect(dossie).toBeHidden();
    expect(page.url()).toBe(urlDoFunil);
    await foto(page, "02-de-volta-ao-funil");
  });

  test("deep link ?lead= abre o funil do negócio e a URL fica limpa ao fechar", async ({ page }) => {
    await login(page, c.users.manager!.email, c.password);
    await page.setViewportSize({ width: 1280, height: 768 });

    await page.goto(`/app/kanban?lead=${leadId}`);
    await page.waitForURL(new RegExp(`/app/pipelines/${funilId}\\?lead=${leadId}$`), { timeout: 60_000 });
    const dossie = page.getByRole("dialog");
    await expect(dossie).toBeVisible({ timeout: 60_000 });
    await expect(dossie.getByRole("region", { name: "Conversa" })).toBeVisible();

    await dossie.getByRole("button", { name: /^(Close|Fechar)$/ }).click();
    await expect(dossie).toBeHidden();
    await expect.poll(() => new URL(page.url()).search).toBe("");
    expect(new URL(page.url()).pathname).toBe(`/app/pipelines/${funilId}`);
  });

  test("pelo dossiê: troca o responsável, edita nome e e-mail do contato e as seções têm respiro", async ({ page }) => {
    await login(page, c.users.manager!.email, c.password);
    await page.setViewportSize({ width: 1280, height: 768 });

    await page.goto(`/app/pipelines/${funilId}?lead=${leadId}`);
    const dossie = page.getByRole("dialog");
    await expect(dossie).toBeVisible({ timeout: 60_000 });
    await expect(dossie.getByText("Dados do negócio")).toBeVisible({ timeout: 60_000 });

    // ── respiro entre as seções: medido, não a olho ────────────────────────────
    const respiro = await page.evaluate(() => {
      const secao = Array.from(document.querySelectorAll('[role="dialog"] section')).find(
        // O título leva o sinal de recolher (`+`/`−`, aria-hidden) dentro do <h3>:
        // compara só o nome da seção.
        (el) => el.querySelector("h3 span")?.textContent?.trim().toLowerCase() === "contato",
      );
      if (!secao) return null;
      const cs = getComputedStyle(secao);
      return { paddingTop: parseFloat(cs.paddingTop), paddingBottom: parseFloat(cs.paddingBottom) };
    });
    registra(`funil-dossie respiro entre seções · ${JSON.stringify(respiro)}`);
    expect(respiro, "a seção Contato existe no dossiê").not.toBeNull();
    expect(respiro!.paddingTop, "respiro acima da seção (era 12px)").toBeGreaterThanOrEqual(20);
    expect(respiro!.paddingBottom, "respiro abaixo da seção (era 12px)").toBeGreaterThanOrEqual(20);
    await foto(page, "05-dossie-com-respiro");

    // ── responsável: o círculo pontilhado abre a lista e a escolha vai ao banco ──
    const gatilho = dossie.getByRole("button", { name: /Alterar responsável/ });
    await expect(gatilho).toBeVisible();
    await gatilho.click();
    const opcoes = page.getByRole("menuitemradio");
    await expect(opcoes.first()).toBeVisible();
    const nomes = (await opcoes.allInnerTexts()).map((n) => n.trim());
    registra(`funil-dossie responsável · opções = ${JSON.stringify(nomes)}`);
    expect(nomes[0]).toBe("Sem responsável");
    expect(nomes.length, "além de 'Sem responsável', há pessoas para escolher").toBeGreaterThan(1);
    const escolhido = nomes[1]!;
    await foto(page, "06-lista-de-responsaveis");
    await opcoes.filter({ hasText: escolhido }).first().click();

    await expect
      .poll(async () => {
        const { data } = await admin.from("crm_leads").select("owner_user_id, owner_kind").eq("id", leadId).single();
        return (data as { owner_user_id: string | null; owner_kind: string | null }).owner_user_id;
      }, { timeout: 30_000 })
      .not.toBeNull();
    await expect(dossie.getByRole("button", { name: new RegExp(`Alterar responsável: ${escolhido}`) })).toBeVisible({
      timeout: 30_000,
    });

    // …e volta para "Sem responsável".
    await dossie.getByRole("button", { name: /Alterar responsável/ }).click();
    await page.getByRole("menuitemradio", { name: "Sem responsável" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin.from("crm_leads").select("owner_user_id").eq("id", leadId).single();
        return (data as { owner_user_id: string | null }).owner_user_id;
      }, { timeout: 30_000 })
      .toBeNull();

    // ── contato: nome e e-mail editados ali mesmo ───────────────────────────────
    await dossie.getByRole("button", { name: "Editar contato" }).click();
    const nome = dossie.getByLabel("Nome");
    const email = dossie.getByLabel("E-mail");
    await expect(nome).toHaveValue(`Cliente Funil ${SUFIXO}`);
    await nome.fill(`Cliente Funil Editado ${SUFIXO}`);
    await email.fill("isto-nao-e-email");
    // O dossiê tem outro "Salvar" (dados do negócio): o do contato é o do formulário dele.
    const edicao = dossie.getByTestId("edicao-do-contato");
    await edicao.getByRole("button", { name: "Salvar" }).click();
    await expect(dossie.getByText("E-mail inválido.")).toBeVisible();
    await foto(page, "07-edicao-do-contato-com-erro");

    await email.fill(`funil.${SUFIXO}@exemplo.com`);
    await edicao.getByRole("button", { name: "Salvar" }).click();
    await expect(dossie.getByLabel("Nome")).toBeHidden({ timeout: 30_000 });
    await expect
      .poll(async () => {
        const { data } = await admin.from("contacts").select("name, email").eq("id", contatoId).single();
        return JSON.stringify(data);
      }, { timeout: 30_000 })
      .toBe(JSON.stringify({ name: `Cliente Funil Editado ${SUFIXO}`, email: `funil.${SUFIXO}@exemplo.com` }));
    await expect(dossie.getByText(`Cliente Funil Editado ${SUFIXO}`)).toBeVisible();
    await expect(dossie.getByRole("link", { name: `funil.${SUFIXO}@exemplo.com` })).toBeVisible();
    await foto(page, "08-contato-editado");
  });

  test("no celular: a alternância Conversa | Negócio abre na conversa e nada transborda na horizontal", async ({ page }) => {
    await login(page, c.users.manager!.email, c.password);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/app/pipelines/${funilId}?lead=${leadId}`);
    const dossie = page.getByRole("dialog");
    await expect(dossie).toBeVisible({ timeout: 60_000 });
    // Só as abas do dossiê: a ficha do contato, dentro dele, também tem abas.
    const abas = dossie.getByRole("tablist", { name: "Seções do negócio" }).getByRole("tab");
    await expect(abas).toHaveCount(2);
    await expect(abas.nth(0)).toHaveText(/Conversa/);
    await expect(abas.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(dossie.getByRole("region", { name: "Conversa" })).toBeVisible();
    await expect(dossie.getByRole("textbox", { name: "Mensagem" })).toBeVisible();

    const medida = await page.evaluate(() => ({
      corpo: document.body.scrollWidth <= document.body.clientWidth,
      dossie: (() => {
        const d = document.querySelector('[role="dialog"]') as HTMLElement;
        return d.scrollWidth <= d.clientWidth + 1;
      })(),
    }));
    registra(`funil-dossie 390x844 · ${JSON.stringify(medida)}`);
    expect(medida.corpo, "o corpo da página não rola na horizontal").toBe(true);
    expect(medida.dossie, "o dossiê não rola na horizontal").toBe(true);
    await foto(page, "03-celular-aba-conversa");

    await abas.nth(1).click();
    await expect(abas.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(dossie.getByText("Dados do negócio")).toBeVisible();
    await expect(dossie.getByRole("region", { name: "Conversa" })).toBeHidden();
    await foto(page, "04-celular-aba-negocio");
  });
});
