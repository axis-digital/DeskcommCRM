/**
 * O DOSSIÊ DO NEGÓCIO DIZ DE ONDE O CONTATO VEIO (issue #69, PR #77).
 *
 * Quem trabalha no funil precisava sair do dossiê e abrir a ficha completa para
 * saber a origem da pessoa. A aba "Dados" da seção Contato passou a mostrar
 * Origem e, quando houver, Campanha — pela MESMA regra da ficha
 * (`origemDoContato`), lida do que já está gravado em `contacts`.
 *
 * O teste unitário do PR monta o componente com o contato MOCKADO. Ele não prova
 * que a API do contato entrega `source_metadata` à tela, nem que a linha cabe no
 * painel. Esta spec dirige o produto como um operador faria — abre o quadro,
 * clica no card, olha a aba Dados — com contatos gravados no banco, e MEDE:
 *
 *   1. contato com UTM e campanha → "Origem" e "Campanha" com o texto exato; a
 *      campanha longa trunca com reticências DENTRO do painel e leva o nome
 *      inteiro no `title`;
 *   2. contato só com `source` → "Origem" com a coluna, nenhuma "Campanha";
 *   3. contato sem origem nenhuma → nenhuma das duas linhas, e nenhum `dd` vazio
 *      na lista de dados;
 *   4. contato da agenda do celular → "Agenda do celular", por extenso, e não o
 *      código `whatsapp_agenda`.
 *
 * Em todos: o rótulo (`dt`) e o valor (`dd`) ficam na MESMA linha da grade
 * (mesmo `top`), o valor tem área visível, e nada transborda o dossiê na
 * horizontal (1280px e 390px).
 *
 * Fixture: funil, etapa, quatro contatos e quatro negócios, todos com sufixo
 * único e apagados no fim. Login como `manager` do seed de credenciais (sem MFA),
 * o mesmo papel da `funil-conversa-no-dossie`.
 */
import { randomInt } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { ORIGEM_AGENDA_DO_CELULAR } from "../../lib/leads/origem-do-contato";
import { expect, test, type Page } from "./helpers/test";
import { abreQuadro, admin, creds, insere, login, type Creds } from "./qa-l12-comum";

const EVIDENCIA = path.join(process.cwd(), "evidence", "dossie-origem-do-contato");
const SUFIXO = `${Date.now()}`.slice(-7);
const CAMPANHA_LONGA = `Black Friday 2026 — remarketing de carrinho abandonado, público quente ${SUFIXO}`;

interface Cenario {
  chave: string;
  nome: string;
  source: string;
  metadata: Record<string, unknown>;
  origemEsperada: string | null;
  campanhaEsperada: string | null;
}

const CENARIOS: Cenario[] = [
  {
    chave: "1-utm-e-campanha",
    nome: `Cliente UTM ${SUFIXO}`,
    source: "site",
    metadata: { utm_source: "instagram", utm_medium: "cpc", utm_campaign: CAMPANHA_LONGA },
    origemEsperada: "instagram",
    campanhaEsperada: CAMPANHA_LONGA,
  },
  {
    chave: "2-so-source",
    nome: `Cliente só source ${SUFIXO}`,
    source: "whatsapp",
    metadata: {},
    origemEsperada: "whatsapp",
    campanhaEsperada: null,
  },
  {
    chave: "3-sem-origem",
    nome: `Cliente sem origem ${SUFIXO}`,
    source: "",
    metadata: {},
    origemEsperada: null,
    campanhaEsperada: null,
  },
  {
    chave: "4-agenda-do-celular",
    nome: `Cliente agenda ${SUFIXO}`,
    source: ORIGEM_AGENDA_DO_CELULAR,
    metadata: {},
    origemEsperada: "Agenda do celular",
    campanhaEsperada: null,
  },
];

let c: Creds;
let funilId = "";
const contatos: string[] = [];
const titulos = new Map<string, string>();

function registra(linha: string): void {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  fs.appendFileSync(path.join(EVIDENCIA, "medicoes.txt"), `${linha}\n`);
}

interface Medida {
  rotulos: string[];
  ddVazios: number;
  origem: LinhaMedida | null;
  campanha: LinhaMedida | null;
  transbordaDossie: boolean;
  transbordaPagina: boolean;
}

interface LinhaMedida {
  texto: string;
  title: string | null;
  rotulo: string;
  mesmaLinhaDoRotulo: boolean;
  largura: number;
  altura: number;
  dentroDoDossie: boolean;
  truncado: boolean;
  textOverflow: string;
  whiteSpace: string;
}

/** Mede a aba Dados por ferramenta: DOM, caixas e estilo computado. */
async function medirAbaDados(page: Page): Promise<Medida> {
  return page.evaluate(() => {
    const dossie = document.querySelector('[role="dialog"]')!;
    const caixaDoDossie = dossie.getBoundingClientRect();
    const aba = dossie.querySelector('[data-testid="contato-do-negocio"] [role="tabpanel"][data-state="active"]');
    const lista = aba?.querySelector("dl");

    const linha = (testid: string) => {
      const dd = aba?.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
      if (!dd) return null;
      const dt = dd.previousElementSibling as HTMLElement | null;
      const r = dd.getBoundingClientRect();
      const rt = dt?.getBoundingClientRect();
      const estilo = getComputedStyle(dd);
      return {
        texto: (dd.textContent ?? "").trim(),
        title: dd.getAttribute("title"),
        rotulo: (dt?.textContent ?? "").trim(),
        mesmaLinhaDoRotulo: rt ? Math.abs(rt.top - r.top) < 4 : false,
        largura: r.width,
        altura: r.height,
        dentroDoDossie: r.left >= caixaDoDossie.left - 0.5 && r.right <= caixaDoDossie.right + 0.5,
        truncado: dd.scrollWidth > dd.clientWidth,
        textOverflow: estilo.textOverflow,
        whiteSpace: estilo.whiteSpace,
      };
    };

    return {
      rotulos: Array.from(lista?.querySelectorAll("dt") ?? []).map((d) => (d.textContent ?? "").trim()),
      ddVazios: Array.from(lista?.querySelectorAll("dd") ?? []).filter((d) => (d.textContent ?? "").trim() === "")
        .length,
      origem: linha("origem-do-contato"),
      campanha: linha("campanha-do-contato"),
      transbordaDossie: dossie.scrollWidth > dossie.clientWidth + 1,
      transbordaPagina: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

async function abrirDossie(page: Page, titulo: string, { celular = false } = {}): Promise<void> {
  await abreQuadro(page, funilId, titulo);
  await page.getByRole("group", { name: `Negócio: ${titulo}` }).click();
  // No celular o dossiê abre em abas Conversa | Negócio, na Conversa; o contato
  // mora na aba Negócio, e é nela que o operador toca.
  if (celular) await page.getByRole("dialog").getByRole("tab", { name: "Negócio", exact: true }).click();
  const secao = page.getByRole("dialog").getByTestId("contato-do-negocio");
  await expect(secao).toBeVisible({ timeout: 60_000 });
  // A aba Dados é a padrão; o operador a vê aberta, sem clicar.
  await expect(secao.getByRole("tab", { name: "Dados" })).toHaveAttribute("data-state", "active");
}

async function foto(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  const secao = page.getByRole("dialog").getByTestId("contato-do-negocio");
  await secao.scrollIntoViewIfNeeded();
  await secao.screenshot({ path: path.join(EVIDENCIA, `${nome}-aba-dados.png`), animations: "disabled" });
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}-tela.png`), animations: "disabled" });
}

test.describe("Dossiê do negócio: a aba Dados mostra a origem do contato", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeAll(async () => {
    c = creds();
    fs.rmSync(path.join(EVIDENCIA, "medicoes.txt"), { force: true });
    funilId = await insere("crm_pipelines", {
      organization_id: c.org_id,
      name: `Origem QA ${SUFIXO}`,
      slug: `qa-origem-${SUFIXO}`,
    });
    const etapa = await insere("crm_stages", {
      organization_id: c.org_id,
      pipeline_id: funilId,
      name: "Entrada",
      slug: `entrada-${SUFIXO}`,
      position: 1000,
    });
    let posicao = 1000;
    for (const cenario of CENARIOS) {
      const contatoId = await insere("contacts", {
        organization_id: c.org_id,
        name: cenario.nome,
        phone_number: `+5511${randomInt(100000000, 1000000000)}`,
        source: cenario.source,
        source_metadata: cenario.metadata,
      });
      contatos.push(contatoId);
      const titulo = `Negócio ${cenario.chave} ${SUFIXO}`;
      titulos.set(cenario.chave, titulo);
      await insere("crm_leads", {
        organization_id: c.org_id,
        pipeline_id: funilId,
        stage_id: etapa,
        contact_id: contatoId,
        title: titulo,
        position_in_stage: posicao,
        source: "manual",
      });
      posicao += 1000;
    }
  });

  test.afterAll(async () => {
    if (funilId) {
      await admin.from("crm_lead_activities").delete().eq("pipeline_id", funilId);
      await admin.from("crm_leads").delete().eq("pipeline_id", funilId);
      await admin.from("crm_stages").delete().eq("pipeline_id", funilId);
      await admin.from("crm_pipelines").delete().eq("id", funilId);
    }
    if (contatos.length > 0) await admin.from("contacts").delete().in("id", contatos);
  });

  for (const cenario of CENARIOS) {
    test(`cenário ${cenario.chave}: origem=${cenario.origemEsperada ?? "—"} campanha=${
      cenario.campanhaEsperada ? "sim" : "—"
    }`, async ({ page }) => {
      await login(page, c.users.manager!.email, c.password);
      await page.setViewportSize({ width: 1280, height: 800 });
      await abrirDossie(page, titulos.get(cenario.chave)!);

      const m = await medirAbaDados(page);
      registra(`${cenario.chave} 1280x800 · ${JSON.stringify(m)}`);
      await foto(page, cenario.chave);

      // Nenhum rótulo sem valor, em nenhum cenário: a linha vazia era o risco.
      expect(m.ddVazios, "nenhum dd vazio na aba Dados").toBe(0);
      expect(m.transbordaDossie, "o dossiê não rola na horizontal").toBe(false);
      expect(m.transbordaPagina, "a página não rola na horizontal").toBe(false);

      if (cenario.origemEsperada === null) {
        expect(m.origem, "sem origem, a linha Origem não existe").toBeNull();
        expect(m.rotulos).not.toContain("Origem");
      } else {
        expect(m.origem, "a linha Origem existe").not.toBeNull();
        expect(m.origem!.rotulo).toBe("Origem");
        expect(m.origem!.texto).toBe(cenario.origemEsperada);
        expect(m.origem!.mesmaLinhaDoRotulo, "rótulo e valor na mesma linha da grade").toBe(true);
        expect(m.origem!.largura).toBeGreaterThan(0);
        expect(m.origem!.altura).toBeGreaterThan(0);
        expect(m.origem!.dentroDoDossie, "o valor cabe no dossiê").toBe(true);
      }
      if (cenario.origemEsperada === "Agenda do celular") {
        expect(m.origem!.texto).not.toContain(ORIGEM_AGENDA_DO_CELULAR);
      }

      if (cenario.campanhaEsperada === null) {
        expect(m.campanha, "sem campanha, a linha Campanha não existe").toBeNull();
        expect(m.rotulos).not.toContain("Campanha");
      } else {
        expect(m.campanha, "a linha Campanha existe").not.toBeNull();
        expect(m.campanha!.rotulo).toBe("Campanha");
        expect(m.campanha!.texto).toBe(cenario.campanhaEsperada);
        expect(m.campanha!.title, "o nome inteiro fica no title").toBe(cenario.campanhaEsperada);
        expect(m.campanha!.mesmaLinhaDoRotulo).toBe(true);
        expect(m.campanha!.dentroDoDossie, "a campanha longa não sai do dossiê").toBe(true);
        expect(m.campanha!.truncado, "a campanha longa é cortada, não quebra a grade").toBe(true);
        expect(m.campanha!.textOverflow).toBe("ellipsis");
        expect(m.campanha!.whiteSpace).toBe("nowrap");
      }
    });
  }

  test("cenário 1 a 390px: origem e campanha cabem no celular", async ({ page }) => {
    await login(page, c.users.manager!.email, c.password);
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirDossie(page, titulos.get("1-utm-e-campanha")!, { celular: true });

    const m = await medirAbaDados(page);
    registra(`1-utm-e-campanha 390x844 · ${JSON.stringify(m)}`);
    await foto(page, "1-utm-e-campanha-390px");

    expect(m.transbordaPagina, "a página não rola na horizontal a 390px").toBe(false);
    expect(m.origem?.texto).toBe("instagram");
    expect(m.campanha?.dentroDoDossie).toBe(true);
    expect(m.campanha?.textOverflow).toBe("ellipsis");
  });
});
