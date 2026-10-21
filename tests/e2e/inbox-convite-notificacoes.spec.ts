/**
 * A INBOX CONVIDA A LIGAR AS NOTIFICAÇÕES DA ÁREA DE TRABALHO — provado pela tela.
 *
 * ## O defeito que ele guarda
 *
 * O aviso de mensagem nova na bandeja do sistema existia (`emitNotification`),
 * mas a permissão do navegador só era pedida em Configurações › Notificações.
 * Quem não abria aquela tela nunca recebia aviso com o CRM em outra aba — a
 * funcionalidade ficava invisível para quem mais precisa dela.
 *
 * ## Por que a `Notification` é um dublê
 *
 * O Chromium headless não desenha o pedido de permissão nem a bandeja do SO.
 * O dublê reproduz o contrato da API (`permission` começa `default`,
 * `requestPermission()` decide, `new Notification()` registra) e deixa o teste
 * provar o que é nosso: a faixa aparece, o clique pede a permissão, a
 * confirmação sai pela bandeja, e "Agora não" é lembrado.
 *
 * Não prova a notificação de uma mensagem REAL chegando pelo Realtime — isso
 * depende de um inbound do WhatsApp; a regra de quem é avisado é coberta por
 * `lib/notifications/policy.test.ts` e `destinatarios-da-mensagem.test.ts`.
 *
 * Pré-requisitos (banco local, app buildada):
 *   pnpm exec tsx scripts/seed-e2e-credentials.ts
 *   pnpm e2e:env && pnpm e2e:build
 *   E2E_PORT=3031 pnpm exec playwright test tests/e2e/inbox-convite-notificacoes.spec.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test, type BrowserContext, type Page } from "./helpers/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), "evidence/inbox-convite-notificacoes");

interface Creds {
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

let creds: Creds;

/** Sem MFA — mesmo motivo de `notificacoes-diz-o-que-falta.spec.ts`. */
const PAPEL_SEM_MFA = "agent";

async function dubleDeNotification(context: BrowserContext, resposta: NotificationPermission) {
  await context.addInitScript((decisao: NotificationPermission) => {
    const criadas: string[] = [];
    let permissao: NotificationPermission = "default";
    class NotificationDuble {
      static get permission() {
        return permissao;
      }
      static async requestPermission() {
        permissao = decisao;
        return permissao;
      }
      onclick: (() => void) | null = null;
      constructor(titulo: string) {
        criadas.push(titulo);
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", { value: NotificationDuble, configurable: true });
    Object.defineProperty(window, "__notificacoesCriadas", { value: criadas });
  }, resposta);
}

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

async function captura(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}.png`), fullPage: true });
}

test.describe("Inbox — convite para as notificações da área de trabalho", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(() => {
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  });

  test("a faixa aparece, o clique pede a permissão e a confirmação sai pela bandeja", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await dubleDeNotification(context, "granted");
    const page = await context.newPage();
    const quem = creds.users[PAPEL_SEM_MFA]!;
    await login(page, quem.email, creds.password);

    await page.goto("/app/inbox");
    const convite = page.getByTestId("convite-notificacoes");
    await expect(convite).toBeVisible();
    await expect(convite).toContainText("mensagem nova");

    // Cabe na coluna da lista (300px): nada transborda para os lados.
    const transborda = await convite.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(transborda, "a faixa transborda a coluna da lista").toBe(false);
    await captura(page, "01-convite-na-inbox");

    await convite.getByRole("button", { name: "Ativar notificações" }).click();

    await expect(convite).toHaveCount(0);
    const criadas = await page.evaluate(
      () => (window as unknown as { __notificacoesCriadas: string[] }).__notificacoesCriadas,
    );
    expect(criadas).toContain("Alertas ligados");
    await captura(page, "02-permissao-concedida-faixa-some");
    await context.close();
  });

  test("'Agora não' tira a faixa e ela não volta ao recarregar", async ({ browser }) => {
    const context = await browser.newContext();
    await dubleDeNotification(context, "granted");
    const page = await context.newPage();
    const quem = creds.users[PAPEL_SEM_MFA]!;
    await login(page, quem.email, creds.password);

    await page.goto("/app/inbox");
    const convite = page.getByTestId("convite-notificacoes");
    await expect(convite).toBeVisible();

    await convite.getByRole("button", { name: "Agora não" }).click();
    await expect(convite).toHaveCount(0);

    await page.reload();
    // Controle positivo: a Inbox carregou de fato antes de afirmar a ausência.
    await expect(page.locator("[data-realtime-status]")).toBeVisible();
    await expect(page.getByTestId("convite-notificacoes")).toHaveCount(0);
    await captura(page, "03-dispensado-nao-volta");
    await context.close();
  });
});
