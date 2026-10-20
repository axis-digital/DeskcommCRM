# Funil direto na aba + conversa dentro do dossiê — Implementation Plan

> ## Status: EXECUTADO (2026-10-19/20) — em produção desde 2026-10-20
>
> | Entrega | PR (fork) | Observação |
> |---|---|---|
> | Base atualizada (Task 0) | #25 | sync com a upstream, 20 commits |
> | Tasks 1–8 | #26 | funil padrão, seletor, `useEnvioDaConversa`, `ConversaEmbutida`, `onAberta`, dossiê com conversa, spec e2e |
> | Pedido posterior: conversa antes do negócio | #27 | coluna esquerda no desktop; abas Conversa \| Negócio no celular |
> | Pedido posterior: responsável, contato, respiro | #28 | `ResponsavelDoNegocio`, edição de nome e e-mail, `py-3` → `py-5` |
> | Promoção | #29 | `develop` → `main` (`d236fc355`) |
>
> **Desvios do plano** (todos decididos durante a execução): `useAuth()` no lugar de `useUser()` no hook; `window.history.replaceState` no lugar de `router.replace` ao fechar o dossiê; h1 da lista passou a "Todos os funis"; o quadro ganhou `metadata.title`; traduções também em zh-CN; `ConversaNoDossie` perdeu `contactId`/`phone` (o botão de iniciar mora no painel); a feature nasceu empilhada no #25; a conversa embutida ganhou marcação de lida, uma instância por conversa (a citação não vazava) e rascunho com modo (nota nunca volta como resposta). Os rulings completos estão no corpo dos PRs e na memória do projeto (`mem_20261020_a861c5b9715c49ab8974`).
>
> **Prova:** `tests/e2e/funil-conversa-no-dossie.spec.ts` (5 casos, `SPECS_PARTE_6`), evidência em `evidence/funil-conversa-no-dossie/01–08`, jornada J4.43. Única falha da suíte unitária: `pdf-extractor.test.ts`, já presente na linha de base.
>
> **Fica para depois (menores, não corrigidos):** padrão ARIA completo nas abas do celular; painel da conversa monta oculto no celular; `Map` de rascunhos não é limpo no logout/troca de organização; `?lead=` permanece na URL ao trocar de card; 404/erro de carga sem "tentar de novo"; fechar o dossiê do Calendário não invalida o quadro. Pendência de produção separada: [2026-10-20-reacao-do-cliente-webhook-por-sessao.md](2026-10-20-reacao-do-cliente-webhook-por-sessao.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba "Funis" abre direto o quadro do funil padrão, com troca rápida entre funis por um seletor segmentado; e o dossiê do negócio mostra a conversa do contato com o composer da Inbox, para responder sem sair do quadro.

**Architecture:** `/app/kanban` vira um redirecionador server-side para `/app/pipelines/<padrão>`. A lista de funis atual muda para `/app/kanban/funis`. O seletor do título vira um componente próprio (`SeletorDeFunil`): pílulas até 4 funis, `Select` acima disso. No dossiê, um novo `ConversaEmbutida` monta os MESMOS `ChatThread` e `Composer` da Inbox. As regras de bloqueio do envio (janela de 24h, contato bloqueado, suporte somente-leitura, conversa fechada) saem do `InboxLayout` para um hook único, `useEnvioDaConversa`, que os dois lados consomem. Assim continua existindo um só composer e uma só regra.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6 estrito, Tailwind 4, shadcn/ui (Sheet, Select), TanStack Query, Vitest + Testing Library, Playwright.

**Spec:** pedido do dono em 2026-10-15 (conversa da sessão), com decisões registradas em "Decisões" abaixo. Achados que embasam o desenho: `components/kanban/ConversaSlot.tsx` (cabeçalho "Por que atalho e não um composer aqui dentro"), `app/app/pipelines/[id]/_client.tsx:155-200` (seletor atual) e `components/shell/Sidebar.tsx:330` (regra de item ativo).

## Decisões (revisáveis pelo dono antes da execução)

1. **Clicar em "Funis" sempre abre o funil PADRÃO**, não o último visitado (pedido literal). Lembrar o último é uma melhoria separada.
2. **Pílulas até 4 funis; acima disso, o `Select` atual.** Mais de 4 pílulas estoura a linha em 1280px e vira ruído.
3. **A lista de gestão não some:** ela muda para `/app/kanban/funis` ("Todos os funis"), com porta no hub "Ver tudo em CRM" e no cabeçalho do quadro.
4. **O composer do dossiê é o da Inbox, sem cópia.** Busca na conversa, atalhos J/K e o painel CRM ficam só na Inbox. O dossiê mantém o link "Abrir no Inbox" para quem quiser a tela completa.
5. **Desktop (≥ lg):** o dossiê alarga para duas colunas (negócio | conversa). **Abaixo de lg:** alternância "Negócio | Conversa" no topo do painel.

## Global Constraints

- PR **somente** no fork: `gh pr create -R axis-digital/DeskcommCRM --base main`. Nunca no `upstream`.
- Antes de codar: o fork precisa estar atualizado com a upstream (Task 0). Medido em 2026-10-15: `origin/main` estava **297** commits atrás de `upstream/main`.
- Sem mudança de schema: **nenhuma migration** e nenhum apêndice no `baseline.sql`. Se surgir necessidade de schema, pare e revise o plano (a faixa do fork é 9000–9999).
- Toda string visível passa por `t()` e entra no espanhol (`lib/i18n/dicionario.ts`) e no inglês (`lib/i18n/traducoes/en.json`). Gate: `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` e `tests/unit/i18n-catalogo-do-menu.test.ts`.
- Tela nova tem porta em `lib/navigation/catalogo.ts` (DoD 14; gate `tests/unit/navegacao-completude.test.ts`).
- Spec e2e nova entra numa `SPECS_PARTE_*` de `.github/workflows/e2e.yml` (gate `tests/unit/e2e-cobertura-completa.test.ts`).
- Alvo de toque: `min-h-11` no celular e `lg:min-h-8` no desktop, mesmo padrão do `InboxLayout`.
- Sem `console.log`. A suíte vale pelo **exit code** de `pnpm test:unit`, sem caminho (ver CLAUDE.md, "Testes").
- Altura fixa lê a reserva do rodapé (`tests/unit/altura-fixa-le-a-reserva-do-rodape.test.ts`): não introduzir `calc()` com número próprio.

## Review Focus

1. **Esc ou fechar com resposta digitada pela metade:** o rascunho não pode se perder. Ao reabrir o mesmo negócio, o texto volta (teste na Task 7).
2. **Conversa fora do escopo do agente** (atribuída a outro, escopo restrito): o dossiê abre normalmente e o painel diz "Conversa não encontrada ou fora do seu acesso", sem quebrar (teste na Task 5).
3. **Funil padrão arquivado ou nenhum funil vivo:** cai no primeiro funil vivo por `position`. Sem nenhum, vai para a lista com o estado vazio "Criar meu primeiro funil" (teste na Task 1).
4. **Deep link `/app/kanban?lead=<id>` de um negócio que está em OUTRO funil:** precisa abrir o funil do negócio, não o padrão (onde o dossiê não abriria). Teste na Task 2.
5. **Janela de 24h fechada (API oficial) ou contato bloqueado ou suporte somente-leitura:** o composer do dossiê bloqueia com o MESMO motivo da Inbox (teste na Task 4, que é a fonte única).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/kanban/funil-padrao.ts` | Criar | Regra pura: qual funil é o padrão |
| `lib/kanban/funil-padrao.test.ts` | Criar | Casos da regra |
| `app/app/kanban/page.tsx` | Reescrever | Redirecionador (padrão ou funil do `?lead`) |
| `app/app/kanban/funis/{page,_client,loading}.tsx`, `_components/`, `_client.test.tsx` | Mover (`git mv`) | Lista e gestão de funis, sem mudança de comportamento |
| `lib/navigation/catalogo.ts` | Modificar | Campo `ativoEm`, entrada "Todos os funis" |
| `lib/navigation/rota-ativa.ts` (+ `.test.ts`) | Criar | Regra única de "item ativo" para Sidebar e BarraInferior |
| `components/shell/Sidebar.tsx:330`, `components/shell/BarraInferior.tsx:158` | Modificar | Usar `rotaEstaAtiva` |
| `components/kanban/SeletorDeFunil.tsx` (+ `.test.tsx`) | Criar | Pílulas (≤4) ou Select (>4) |
| `app/app/pipelines/[id]/page.tsx`, `_client.tsx`, `trocar-funil.test.tsx` | Modificar | Passar `is_default`; usar `SeletorDeFunil`; link "Todos os funis" |
| `hooks/inbox/useEnvioDaConversa.ts` (+ `.test.ts`) | Criar | Fonte única das guardas de envio |
| `components/inbox/InboxLayout.tsx:387-415` | Modificar | Consumir o hook (sem mudar comportamento) |
| `components/inbox/ConversaEmbutida.tsx` (+ `.test.tsx`) | Criar | Thread + avisos + Composer para outra tela |
| `components/kanban/AbrirConversaDoLead.tsx` | Modificar | `onAberta?` para abrir no lugar em vez de navegar |
| `components/kanban/LeadDossier.tsx` (+ `.test.tsx`) | Modificar | Duas colunas / alternância; Esc seguro |
| `components/kanban/KanbanBoard.tsx:154,330-333` | Modificar | Fechar: atualiza o quadro, tira `?lead` da URL |
| `tests/e2e/funil-conversa-no-dossie.spec.ts` | Criar | Prova pela tela |
| specs e2e que abrem `/app/kanban` como lista | Modificar | Apontar para `/app/kanban/funis` |
| `docs/testing/user-journey-map.md`, `.changes/funil-direto-e-conversa-no-dossie.md`, `evidence/funil-conversa-no-dossie/` | Criar/Modificar | Registro (DoD 12, 17) |

---

### Task 0: Base atualizada (regra do dono)

**Files:** nenhum arquivo de código.

- [x] **Step 1: Atualizar o fork com a upstream**

```bash
cd /root/projects/DeskcommCRM
git status --short            # árvore precisa estar limpa (os PNGs soltos não são deste trabalho: mover para fora ou apagar com o dono)
git fetch upstream origin
git rev-list --count origin/main..upstream/main   # > 0 → seguir
git switch -c merge/upstream-2026-10-15 origin/main
git merge upstream/main       # conflito: parar e resolver com cabeça (doutrina de branches, regra 5)
git push -u origin merge/upstream-2026-10-15
gh pr create -R axis-digital/DeskcommCRM --base main --title "merge: upstream 2026-10-15" --body "Sincroniza o fork com melgarafael/DeskcommCRM@main."
```

- [x] **Step 2: Depois do merge do PR acima, criar a branch da feature**

```bash
git fetch origin && git switch -c feat/funil-direto-e-conversa-no-dossie origin/main
git rev-list --count HEAD..upstream/main   # esperado: 0
```

- [x] **Step 3: Medir a linha de base** (o vermelho que já existe não é seu)

```bash
pnpm install
pnpm typecheck && pnpm lint
pnpm test:unit > /tmp/vt-base.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/vt-base.log | tail -3
```

---

### Task 1: Regra pura do funil padrão

**Files:**
- Create: `lib/kanban/funil-padrao.ts`
- Test: `lib/kanban/funil-padrao.test.ts`

**Interfaces:**
- Produces: `escolherFunilPadrao<T extends FunilCandidato>(funis: readonly T[]): T | null` e o tipo `FunilCandidato`.

- [x] **Step 1: Escrever o teste que falha**

```ts
// lib/kanban/funil-padrao.test.ts
import { describe, expect, it } from "vitest";
import { escolherFunilPadrao, type FunilCandidato } from "./funil-padrao";

const f = (over: Partial<FunilCandidato> & { id: string }): FunilCandidato => ({
  name: over.id,
  position: 0,
  is_default: false,
  is_archived: false,
  ...over,
});

describe("escolherFunilPadrao", () => {
  it("devolve o funil marcado como padrão quando ele está vivo", () => {
    const r = escolherFunilPadrao([f({ id: "a", position: 0 }), f({ id: "b", position: 1, is_default: true })]);
    expect(r?.id).toBe("b");
  });

  it("ignora o padrão arquivado e cai no primeiro vivo por posição", () => {
    const r = escolherFunilPadrao([
      f({ id: "arq", position: 0, is_default: true, is_archived: true }),
      f({ id: "z", position: 5 }),
      f({ id: "y", position: 2 }),
    ]);
    expect(r?.id).toBe("y");
  });

  it("sem padrão marcado, devolve o primeiro por posição (não pela ordem do array)", () => {
    const r = escolherFunilPadrao([f({ id: "dois", position: 2 }), f({ id: "um", position: 1 })]);
    expect(r?.id).toBe("um");
  });

  it("lista vazia ou só arquivados devolve null", () => {
    expect(escolherFunilPadrao([])).toBeNull();
    expect(escolherFunilPadrao([f({ id: "x", is_archived: true })])).toBeNull();
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run lib/kanban/funil-padrao.test.ts`
Expected: FAIL com `Failed to resolve import "./funil-padrao"`.

- [x] **Step 3: Implementar**

```ts
// lib/kanban/funil-padrao.ts
/**
 * Qual funil a aba "Funis" abre.
 *
 * O padrão marcado vence, mas SÓ se estiver vivo: arquivar o funil padrão não
 * pode transformar a aba num beco (o quadro de um funil que não recebe
 * negócio). Sem padrão vivo, vale a ordem que a organização deu à lista
 * (`position`), nunca a ordem em que o banco devolveu as linhas.
 */
export interface FunilCandidato {
  id: string;
  name: string;
  position: number;
  is_default: boolean;
  is_archived: boolean;
}

export function escolherFunilPadrao<T extends FunilCandidato>(funis: readonly T[]): T | null {
  const vivos = funis.filter((f) => !f.is_archived).sort((a, b) => a.position - b.position);
  return vivos.find((f) => f.is_default) ?? vivos[0] ?? null;
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm vitest run lib/kanban/funil-padrao.test.ts`
Expected: PASS (4 testes).

- [x] **Step 5: Commit**

```bash
git add lib/kanban/funil-padrao.ts lib/kanban/funil-padrao.test.ts
git commit -m "feat(funil): regra pura do funil padrão da aba"
```

---

### Task 2: `/app/kanban` abre o quadro; a lista muda para `/app/kanban/funis`; a sidebar reconhece o quadro

**Files:**
- Move: `app/app/kanban/{page.tsx,_client.tsx,_client.test.tsx,loading.tsx,_components/}` → `app/app/kanban/funis/`
- Create: `app/app/kanban/page.tsx` (redirecionador)
- Create: `lib/navigation/rota-ativa.ts`, `lib/navigation/rota-ativa.test.ts`
- Modify: `lib/navigation/catalogo.ts` (tipo + entrada `/app/kanban` + entrada nova)
- Modify: `components/shell/Sidebar.tsx:330`, `components/shell/BarraInferior.tsx:158`
- Modify: specs e2e que tratam `/app/kanban` como lista

**Interfaces:**
- Consumes: `escolherFunilPadrao` (Task 1).
- Produces: `rotaEstaAtiva(pathname: string, item: { href: string; ativoEm?: readonly string[] }): boolean`; campo opcional `ativoEm?: readonly string[]` em `NavMetadata`.

- [x] **Step 1: Teste da regra de item ativo (falha)**

```ts
// lib/navigation/rota-ativa.test.ts
import { describe, expect, it } from "vitest";
import { rotaEstaAtiva } from "./rota-ativa";

describe("rotaEstaAtiva", () => {
  const funis = { href: "/app/kanban", ativoEm: ["/app/pipelines"] as const };

  it("ativa na própria rota e nas filhas", () => {
    expect(rotaEstaAtiva("/app/kanban", funis)).toBe(true);
    expect(rotaEstaAtiva("/app/kanban/funis", funis)).toBe(true);
  });

  it("ativa no quadro de qualquer funil (ativoEm)", () => {
    expect(rotaEstaAtiva("/app/pipelines/5b1c", funis)).toBe(true);
  });

  it("não ativa por prefixo de texto que não é segmento", () => {
    expect(rotaEstaAtiva("/app/kanbanx", funis)).toBe(false);
    expect(rotaEstaAtiva("/app/pipelinesx/1", funis)).toBe(false);
  });

  it("sem ativoEm, mantém o comportamento antigo", () => {
    expect(rotaEstaAtiva("/app/inbox", { href: "/app/inbox" })).toBe(true);
    expect(rotaEstaAtiva("/app/pipelines/1", { href: "/app/inbox" })).toBe(false);
  });
});
```

Run: `pnpm vitest run lib/navigation/rota-ativa.test.ts` → FAIL (módulo inexistente).

- [x] **Step 2: Implementar a regra**

```ts
// lib/navigation/rota-ativa.ts
/**
 * Um item da navegação está ATIVO na própria rota, nas filhas dela e nas rotas
 * que declarou em `ativoEm`.
 *
 * Existe porque o quadro de um funil mora em `/app/pipelines/<id>`, fora do
 * prefixo de "Funis" (`/app/kanban`): quem estava no quadro via a sidebar sem
 * nenhum item marcado e perdia a referência de onde estava. Sidebar e barra
 * inferior usam esta MESMA função; duas regras de "ativo" divergiriam.
 */
export function rotaEstaAtiva(
  pathname: string,
  item: { href: string; ativoEm?: readonly string[] },
): boolean {
  return [item.href, ...(item.ativoEm ?? [])].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
```

Run: `pnpm vitest run lib/navigation/rota-ativa.test.ts` → PASS.

- [x] **Step 3: Catálogo — tipo, entrada de Funis e entrada nova**

Em `lib/navigation/catalogo.ts`, na interface `NavMetadata` (perto da linha 35), acrescentar:

```ts
  /**
   * Outras rotas em que este item conta como ATIVO, além do próprio `href` e
   * das filhas dele. Ver `lib/navigation/rota-ativa.ts`.
   */
  ativoEm?: readonly string[];
```

Na entrada `href: "/app/kanban"` (perto da linha 231), trocar a descrição e acrescentar `ativoEm`:

```ts
    href: "/app/kanban",
    label: "Funis",
    description: "O quadro do seu funil padrão — troque de funil pelo seletor no topo.",
    icon: "Kanban",
    group: "crm",
    section: "O dia a dia da venda",
    sidebar: true,
    ativoEm: ["/app/pipelines"],
```

Logo depois dessa entrada, acrescentar a porta da lista (sem `sidebar`: mora no hub "Ver tudo em CRM" e no ⌘K):

```ts
  {
    // A lista que ERA a aba "Funis". A aba passou a abrir o quadro do funil
    // padrão (pedido do dono, 2026-10-15); criar, renomear, reordenar,
    // arquivar e importar continuam aqui. O nome diz o que a tela mostra a
    // TODOS os papéis: quem não gerencia vê a lista sem os botões.
    href: "/app/kanban/funis",
    label: "Todos os funis",
    description: "Criar, renomear, reordenar e arquivar funis, e importar planilhas de leads.",
    icon: "Kanban",
    group: "crm",
    section: "Preparar a venda",
  },
```

Acrescentar as três strings novas (`"O quadro do seu funil padrão — troque de funil pelo seletor no topo."`, `"Todos os funis"` e `"Criar, renomear, reordenar e arquivar funis, e importar planilhas de leads."`) ao espanhol em `lib/i18n/dicionario.ts` e ao inglês em `lib/i18n/traducoes/en.json`, seguindo o formato das entradas vizinhas.

- [x] **Step 4: Sidebar e barra inferior usam a regra**

`components/shell/Sidebar.tsx:330`:

```tsx
                    const isActive = rotaEstaAtiva(pathname, item);
```

`components/shell/BarraInferior.tsx:158`:

```tsx
          const aqui = rotaEstaAtiva(pathname, aba);
```

Nos dois arquivos: `import { rotaEstaAtiva } from "@/lib/navigation/rota-ativa";`. Se o tipo de `aba` em `BarraInferior` não carrega `ativoEm`, propagar o campo de onde a aba é montada a partir do catálogo (`grep -n "href" components/shell/BarraInferior.tsx`).

- [x] **Step 5: Mover a lista**

```bash
mkdir -p app/app/kanban/funis
git mv app/app/kanban/page.tsx app/app/kanban/funis/page.tsx
git mv app/app/kanban/_client.tsx app/app/kanban/funis/_client.tsx
git mv app/app/kanban/_client.test.tsx app/app/kanban/funis/_client.test.tsx
git mv app/app/kanban/loading.tsx app/app/kanban/funis/loading.tsx
git mv app/app/kanban/_components app/app/kanban/funis/_components
grep -rn '"\.\./' app/app/kanban/funis | head   # imports relativos que subiram um nível
```

Em `app/app/kanban/funis/page.tsx`: renomear a função para `TodosOsFunisPage` e trocar `metadata.title` para `"Todos os funis"`. O resto fica igual.

- [x] **Step 6: Escrever o redirecionador**

```tsx
// app/app/kanban/page.tsx
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { escolherFunilPadrao } from "@/lib/kanban/funil-padrao";

export const dynamic = "force-dynamic";

/**
 * A aba "Funis" abre o QUADRO, não a lista (pedido do dono, 2026-10-15).
 *
 * - `?lead=<id>` é deep link de negócio: abre o funil DELE, não o padrão.
 *   No padrão o dossiê não abriria, porque o negócio não está naquele quadro.
 * - Sem nenhum funil vivo, a lista em `/app/kanban/funis` tem o estado vazio
 *   que ensina a criar o primeiro.
 * - O filtro de `organization_id` não é redundante com a RLS: ela libera todas
 *   as organizações do usuário (ver o cabeçalho de `funis/page.tsx`).
 */
export default async function FunilDaAbaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const params = await searchParams;
  const leadId = typeof params.lead === "string" ? params.lead : null;
  const supabase = await createClient();

  if (leadId) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("pipeline_id")
      .eq("organization_id", activeOrg.orgId)
      .eq("id", leadId)
      .maybeSingle();
    if (lead?.pipeline_id) {
      redirect(`/app/pipelines/${lead.pipeline_id}?lead=${encodeURIComponent(leadId)}`);
    }
  }

  const { data } = await supabase
    .from("crm_pipelines")
    .select("id, name, position, is_default, is_archived")
    .eq("organization_id", activeOrg.orgId);

  const padrao = escolherFunilPadrao(data ?? []);
  if (!padrao) redirect("/app/kanban/funis");
  redirect(`/app/pipelines/${padrao.id}`);
}
```

Confirmar o nome da coluna antes de rodar: `grep -n "pipeline_id" lib/database.types.ts | head -3`.

- [x] **Step 7: Atualizar quem tratava `/app/kanban` como lista**

```bash
git grep -nE "/app/kanban\b" -- tests app components lib hooks | grep -v "kanban/funis"
```

Para cada ocorrência que espera ver a LISTA (cards de funil, "Criar funil", "Importar", arquivados), trocar o destino para `/app/kanban/funis`. Ocorrências que só querem "chegar num quadro" podem continuar em `/app/kanban`. Specs conhecidas na upstream: `pipelines-gestao.spec.ts`, `funil-arquivado-volta-pela-tela.spec.ts`, `rbac-roles.spec.ts`, `invite-lifecycle.spec.ts`, `qa-l12-funil.spec.ts` e mais 6 (o grep dá a lista exata).

- [x] **Step 8: Rodar os gates da task**

```bash
pnpm vitest run lib/navigation lib/kanban app/app/kanban tests/unit/navegacao-completude.test.ts tests/unit/i18n-catalogo-do-menu.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts
pnpm typecheck
```

Expected: tudo PASS. Se `navegacao-completude` reclamar de `/app/kanban` sem tela própria, a entrada continua válida porque a rota existe (o redirect é uma página).

- [x] **Step 9: Commit**

```bash
git add -A app/app/kanban lib/navigation components/shell lib/i18n tests
git commit -m "feat(funil): a aba Funis abre o quadro do funil padrão; lista vira Todos os funis"
```

---

### Task 3: Seletor segmentado de funil

**Files:**
- Create: `components/kanban/SeletorDeFunil.tsx`, `components/kanban/SeletorDeFunil.test.tsx`
- Modify: `app/app/pipelines/[id]/page.tsx` (select `is_default`), `app/app/pipelines/[id]/_client.tsx:29-36,155-200`, `app/app/pipelines/[id]/trocar-funil.test.tsx`

**Interfaces:**
- Produces: `SeletorDeFunil({ funis, atualId, nomeAtual }: { funis: ReadonlyArray<{ id: string; name: string; is_default?: boolean }>; atualId: string; nomeAtual: string })` e `LIMITE_EM_PILULAS = 4`.

- [x] **Step 1: Teste que falha**

```tsx
// components/kanban/SeletorDeFunil.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeletorDeFunil } from "./SeletorDeFunil";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

const funis = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: `Funil ${i}`, is_default: i === 0 }));

describe("SeletorDeFunil", () => {
  it("com um funil só, mostra o título puro e nenhum controle", () => {
    render(<SeletorDeFunil funis={funis(1)} atualId="f0" nomeAtual="Funil 0" />);
    expect(screen.getByRole("heading", { level: 1, name: "Funil 0" })).toBeVisible();
    expect(screen.queryByTestId("trocar-funil")).toBeNull();
  });

  it("até 4 funis, mostra pílulas-link com o atual marcado", () => {
    render(<SeletorDeFunil funis={funis(3)} atualId="f1" nomeAtual="Funil 1" />);
    const nav = screen.getByTestId("trocar-funil");
    expect(nav.tagName).toBe("NAV");
    const atual = screen.getByTestId("trocar-funil-opcao-f1");
    expect(atual).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("trocar-funil-opcao-f2")).toHaveAttribute("href", "/app/pipelines/f2");
    // o h1 continua existindo para leitor de tela
    expect(screen.getByRole("heading", { level: 1, name: "Funil 1" })).toBeInTheDocument();
  });

  it("acima de 4 funis, volta ao Select (não estoura a linha)", () => {
    render(<SeletorDeFunil funis={funis(5)} atualId="f0" nomeAtual="Funil 0" />);
    expect(screen.getByTestId("trocar-funil")).toHaveAttribute("role", "combobox");
  });
});
```

Run: `pnpm vitest run components/kanban/SeletorDeFunil.test.tsx` → FAIL.

- [x] **Step 2: Implementar**

```tsx
// components/kanban/SeletorDeFunil.tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Acima disto as pílulas não cabem numa linha a 1280px e viram ruído. */
export const LIMITE_EM_PILULAS = 4;

interface Props {
  funis: ReadonlyArray<{ id: string; name: string; is_default?: boolean }>;
  atualId: string;
  nomeAtual: string;
}

/**
 * Troca de funil no título do quadro.
 *
 * Cada funil é uma PÁGINA (`/app/pipelines/<id>`), então as pílulas são links,
 * não botões: Tab anda entre elas, o meio-clique abre em outra aba e o Next
 * pré-carrega o destino. Trocar descarta a query string, porque um filtro de um
 * funil aplicado no outro dá resultado fantasma.
 */
export function SeletorDeFunil({ funis, atualId, nomeAtual }: Props) {
  const t = useT();
  const router = useRouter();

  if (funis.length <= 1) {
    return <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{nomeAtual}</h1>;
  }

  if (funis.length <= LIMITE_EM_PILULAS) {
    return (
      <div className="min-w-0">
        <h1 className="sr-only">{nomeAtual}</h1>
        <nav
          aria-label={t("Trocar de funil")}
          data-testid="trocar-funil"
          className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/40 p-0.5"
        >
          {funis.map((f) => {
            const atual = f.id === atualId;
            return (
              <Link
                key={f.id}
                href={`/app/pipelines/${f.id}`}
                aria-current={atual ? "page" : undefined}
                data-testid={`trocar-funil-opcao-${f.id}`}
                title={f.is_default ? `${f.name} (${t("padrão")})` : f.name}
                className={cn(
                  "inline-flex min-h-11 max-w-[14rem] shrink-0 items-center truncate rounded-md px-3 text-sm font-medium transition-colors lg:min-h-8",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  atual
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{f.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <h1 className="sr-only">{nomeAtual}</h1>
      <Select
        value={funis.some((f) => f.id === atualId) ? atualId : undefined}
        onValueChange={(id) => {
          if (id !== atualId) router.push(`/app/pipelines/${id}`);
        }}
      >
        <SelectTrigger
          aria-label={`${t("Trocar de funil")}: ${nomeAtual}`}
          data-testid="trocar-funil"
          className="h-auto w-auto min-w-0 max-w-full gap-1.5 border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight shadow-none focus:ring-1 focus:ring-ring sm:max-w-[60%] [&>span]:truncate"
        >
          <SelectValue placeholder={nomeAtual} />
        </SelectTrigger>
        <SelectContent>
          {funis.map((f) => (
            <SelectItem key={f.id} value={f.id} data-testid={`trocar-funil-opcao-${f.id}`}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

Run: `pnpm vitest run components/kanban/SeletorDeFunil.test.tsx` → PASS.

- [x] **Step 3: Ligar no quadro**

`app/app/pipelines/[id]/page.tsx`: trocar `.select("id, name")` da lista `funis` por `.select("id, name, is_default")`.

`app/app/pipelines/[id]/_client.tsx`:
- o tipo da prop passa a ser `funis: Array<{ id: string; name: string; is_default: boolean }>`;
- remover o import de `Select…` (linhas 29-35) e as variáveis `podeTrocar`;
- substituir o bloco `<h1 …>{nomeAtual}</h1>{podeTrocar && (<Select …>…</Select>)}` (linhas ~164-200) por:

```tsx
        <div className="flex min-w-0 items-center gap-3">
          <SeletorDeFunil funis={funis} atualId={pipelineId} nomeAtual={nomeAtual} />
          <Link
            href="/app/kanban/funis"
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("Todos os funis")}
          </Link>
        </div>
```

com `import Link from "next/link";` e `import { SeletorDeFunil } from "@/components/kanban/SeletorDeFunil";`.

- [x] **Step 4: Ajustar o teste antigo do quadro**

`app/app/pipelines/[id]/trocar-funil.test.tsx` hoje dirige um `Select`. Para fixtures com 2 a 4 funis, trocar a interação "abrir o combobox e clicar a opção" por "o link `trocar-funil-opcao-<id>` aponta para `/app/pipelines/<id>`". Manter um caso com 5 funis que segue dirigindo o `Select`. O mesmo vale para `tests/e2e/qa-l12-troca-de-funil.spec.ts`: no fixture dele, contar quantos funis existem e escolher o ramo certo.

```bash
pnpm vitest run "app/app/pipelines" components/kanban/SeletorDeFunil.test.tsx
```

Expected: PASS.

- [x] **Step 5: i18n e commit**

Acrescentar `"padrão"` ao espanhol e ao inglês, se a chave ainda não existir (`grep -n '"padrão"' lib/i18n/dicionario.ts`). `"Todos os funis"` já entrou na Task 2.

```bash
git add components/kanban/SeletorDeFunil.tsx components/kanban/SeletorDeFunil.test.tsx "app/app/pipelines" lib/i18n tests/e2e/qa-l12-troca-de-funil.spec.ts
git commit -m "feat(funil): seletor segmentado de funil no título do quadro"
```

---

### Task 4: Fonte única das guardas de envio (`useEnvioDaConversa`)

**Files:**
- Create: `hooks/inbox/useEnvioDaConversa.ts`, `hooks/inbox/useEnvioDaConversa.test.ts`
- Modify: `components/inbox/InboxLayout.tsx:386-415,782-784`

**Interfaces:**
- Consumes: `estadoDaJanela` (`@/lib/channels/janela`), `motivoDaJanelaFechada` e `motivoDoContato` (`@/lib/inbox/motivo-do-envio-bloqueado`), `useUser` (`@/hooks/auth/AuthProvider`), `ConversationWithContact` (`@/hooks/inbox/useConversationsRealtime`).
- Produces: `useEnvioDaConversa(conversa: ConversationWithContact | null): { motivoDaJanela: string | null; blockedReason: string | null; fechada: boolean; somenteLeitura: boolean }`.

- [x] **Step 0: Conferir as assinaturas reais antes de escrever**

```bash
grep -nE "export function (estadoDaJanela|motivoDaJanelaFechada|motivoDoContato)" -A4 lib/channels/janela.ts lib/inbox/motivo-do-envio-bloqueado.ts
grep -nE "export function useUser" -A6 hooks/auth/AuthProvider.tsx
sed -n 150,165p components/inbox/InboxLayout.tsx    # de onde vem `user` no InboxLayout
```

Se `useUser()` não expuser `support`, o hook recebe `somenteLeitura: boolean` como segundo parâmetro, e o `InboxLayout` passa o `supportReadonly` que já calcula. Os testes abaixo mudam só no `renderHook`.

- [x] **Step 1: Teste que falha**

```ts
// hooks/inbox/useEnvioDaConversa.test.ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { useEnvioDaConversa } from "./useEnvioDaConversa";

const usuario = { support: null as null | { access_mode: string } };
vi.mock("@/hooks/auth/AuthProvider", () => ({ useUser: () => usuario }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

const conversa = (over: Partial<ConversationWithContact> = {}) =>
  ({
    id: "c1",
    status: "open",
    last_inbound_at: new Date().toISOString(),
    channel_sessions: { provider: "meta_cloud" },
    contacts: { id: "k1", is_blocked: false },
    ...over,
  }) as unknown as ConversationWithContact;

describe("useEnvioDaConversa", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    usuario.support = null;
  });

  it("conversa aberta, dentro da janela: nada bloqueia", () => {
    const { result } = renderHook(() => useEnvioDaConversa(conversa()));
    expect(result.current).toMatchObject({ motivoDaJanela: null, blockedReason: null, fechada: false });
  });

  it("a janela de 24h fecha sozinha com o relógio, sem recarregar", () => {
    const { result } = renderHook(() => useEnvioDaConversa(conversa()));
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 31_000);
    });
    expect(result.current.motivoDaJanela).not.toBeNull();
  });

  it("suporte somente-leitura bloqueia com o motivo próprio", () => {
    usuario.support = { access_mode: "support_readonly" };
    const { result } = renderHook(() => useEnvioDaConversa(conversa()));
    expect(result.current.blockedReason).toBe("Acompanhamento somente leitura");
    expect(result.current.somenteLeitura).toBe(true);
  });

  it("conversa fechada desabilita", () => {
    const { result } = renderHook(() => useEnvioDaConversa(conversa({ status: "closed" } as never)));
    expect(result.current.fechada).toBe(true);
  });
});
```

Ajustar o valor de `provider` e o campo de bloqueio do contato ao que `estadoDaJanela` e `motivoDoContato` realmente leem (Step 0). O caso da janela só faz sentido para o provider que tem janela (API oficial).

Run: `pnpm vitest run hooks/inbox/useEnvioDaConversa.test.ts` → FAIL.

- [x] **Step 2: Implementar**

```ts
// hooks/inbox/useEnvioDaConversa.ts
"use client";
import { useEffect, useState } from "react";

import { useUser } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { estadoDaJanela } from "@/lib/channels/janela";
import { motivoDaJanelaFechada, motivoDoContato } from "@/lib/inbox/motivo-do-envio-bloqueado";

/** O relógio da janela anda sozinho: a janela que vence com a tela aberta precisa fechar o envio. */
const TICK_DA_JANELA_MS = 30_000;

/**
 * POR QUE O COMPOSER NÃO PODE ENVIAR AGORA. Fonte ÚNICA, usada pela Inbox e
 * pelo dossiê do funil.
 *
 * Antes isto morava inline no `InboxLayout`. Levar o composer para o dossiê sem
 * extrair daqui criaria a segunda regra de bloqueio que o próprio `InboxLayout`
 * proíbe ("dois caminhos para desabilitar o mesmo composer divergem, e o segundo
 * esquece de cobrir o áudio ou o anexo").
 */
export function useEnvioDaConversa(conversa: ConversationWithContact | null) {
  const t = useT();
  const user = useUser();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), TICK_DA_JANELA_MS);
    return () => clearInterval(id);
  }, []);

  const provider = conversa?.channel_sessions?.provider ?? null;
  const janela = estadoDaJanela(provider, conversa?.last_inbound_at ?? null, agora);
  const motivoDaJanela = motivoDaJanelaFechada(janela, provider, t);
  const somenteLeitura = user?.support?.access_mode === "support_readonly";
  const blockedReason = somenteLeitura
    ? "Acompanhamento somente leitura"
    : motivoDoContato(conversa?.contacts, t);

  return { motivoDaJanela, blockedReason, fechada: conversa?.status === "closed", somenteLeitura };
}
```

Run: `pnpm vitest run hooks/inbox/useEnvioDaConversa.test.ts` → PASS.

- [x] **Step 3: O `InboxLayout` passa a consumir o hook (sem mudar comportamento)**

Em `components/inbox/InboxLayout.tsx`:
- remover `agoraJanela` + `useEffect` (≈387-392), `janela` (≈402-406), `motivoDaJanela` (≈409-413) e `blockedReason` (≈415);
- no lugar, `const envio = useEnvioDaConversa(selectedConversation);`;
- no JSX: `motivoDaJanela` → `envio.motivoDaJanela`; `blockedReason={supportReadonly ? "Acompanhamento somente leitura" : blockedReason}` → `blockedReason={envio.blockedReason}`;
- manter `supportReadonly` local, porque ele também protege `onClaim`/`onClose` (linhas ≈880-881);
- remover os imports que ficarem sem uso (`estadoDaJanela`, `motivoDaJanelaFechada`, `motivoDoContato`).

```bash
pnpm vitest run components/inbox hooks/inbox
pnpm typecheck
```

Expected: PASS, sem alterar nenhum teste existente da Inbox. Um teste da Inbox que quebre aqui é sinal de mudança de comportamento: investigue antes de ajustar.

- [x] **Step 4: Commit**

```bash
git add hooks/inbox/useEnvioDaConversa.ts hooks/inbox/useEnvioDaConversa.test.ts components/inbox/InboxLayout.tsx
git commit -m "refactor(inbox): guardas de envio do composer numa fonte única"
```

---

### Task 5: `ConversaEmbutida` — a conversa da Inbox, montável em outra tela

**Files:**
- Create: `components/inbox/ConversaEmbutida.tsx`, `components/inbox/ConversaEmbutida.test.tsx`

**Interfaces:**
- Consumes: `useEnvioDaConversa` (Task 4), `useConversation`/`isNotFound` (`@/hooks/inbox/useConversation`), `ChatThread`, `Composer`, `RetentionNotice`, `JanelaFechadaAviso`, `NumeroForaDoAr`.
- Produces: `ConversaEmbutida({ conversationId, onTrocarConversa? }: { conversationId: string; onTrocarConversa?: (id: string) => void })` e `rascunhoEmbutido(conversationId: string): string` (o rascunho guardado, para a Task 7 testar).

- [x] **Step 0: Conferir a assinatura do `onAbrirConversa` de `NumeroForaDoAr`**

```bash
grep -nE "onAbrirConversa" components/inbox/NumeroForaDoAr.tsx | head -3
```

- [x] **Step 1: Teste que falha**

```tsx
// components/inbox/ConversaEmbutida.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const estado: { data: unknown; error: unknown; isLoading: boolean } = { data: null, error: null, isLoading: false };
vi.mock("@/hooks/inbox/useConversation", () => ({
  useConversation: () => estado,
  isNotFound: (e: unknown) => (e as { status?: number })?.status === 404,
}));
vi.mock("@/hooks/inbox/useEnvioDaConversa", () => ({
  useEnvioDaConversa: () => ({ motivoDaJanela: null, blockedReason: null, fechada: false, somenteLeitura: false }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("./ChatThread", () => ({ ChatThread: () => <div data-testid="thread" /> }));
vi.mock("./Composer", () => ({ Composer: () => <div data-testid="composer" /> }));
vi.mock("./RetentionNotice", () => ({ RetentionNotice: () => null }));
vi.mock("@/components/inbox/JanelaFechadaAviso", () => ({ JanelaFechadaAviso: () => null }));
vi.mock("@/components/inbox/NumeroForaDoAr", () => ({ NumeroForaDoAr: () => null }));

import { ConversaEmbutida } from "./ConversaEmbutida";

describe("ConversaEmbutida", () => {
  it("monta a thread e o composer da Inbox", () => {
    Object.assign(estado, { data: { id: "c1", contacts: { id: "k1" }, channel_sessions: null }, error: null, isLoading: false });
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByTestId("thread")).toBeInTheDocument();
    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });

  it("conversa fora do acesso: diz por quê e não monta o composer", () => {
    Object.assign(estado, { data: null, error: { status: 404 }, isLoading: false });
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByText("Conversa não encontrada ou fora do seu acesso.")).toBeVisible();
    expect(screen.queryByTestId("composer")).toBeNull();
  });

  it("carregando: estado acessível, sem composer", () => {
    Object.assign(estado, { data: null, error: null, isLoading: true });
    render(<ConversaEmbutida conversationId="c1" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("composer")).toBeNull();
  });
});
```

Run: `pnpm vitest run components/inbox/ConversaEmbutida.test.tsx` → FAIL.

- [x] **Step 2: Implementar**

```tsx
// components/inbox/ConversaEmbutida.tsx
"use client";
import { useState, type ComponentProps } from "react";

import { useT } from "@/hooks/i18n/useT";
import { isNotFound, useConversation } from "@/hooks/inbox/useConversation";
import { useEnvioDaConversa } from "@/hooks/inbox/useEnvioDaConversa";
import { JanelaFechadaAviso } from "@/components/inbox/JanelaFechadaAviso";
import { NumeroForaDoAr } from "@/components/inbox/NumeroForaDoAr";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { RetentionNotice } from "./RetentionNotice";

type Respondendo = Parameters<NonNullable<ComponentProps<typeof ChatThread>["onResponder"]>>[0];

/**
 * Rascunho por conversa, vivo enquanto a aba vive. Fechar o dossiê (Esc,
 * clique fora, X) desmonta o composer; sem isto a resposta pela metade
 * sumiria, e o atendente aprenderia que no funil "não dá para confiar".
 */
const rascunhos = new Map<string, string>();
export const rascunhoEmbutido = (conversationId: string) => rascunhos.get(conversationId) ?? "";

/**
 * A conversa da Inbox fora da Inbox: os MESMOS `ChatThread` e `Composer`, com
 * as guardas de `useEnvioDaConversa`. Não é uma segunda implementação. O que
 * fica só na Inbox: busca, atalhos J/K, painel CRM e rascunho sugerido pela IA.
 */
export function ConversaEmbutida({
  conversationId,
  onTrocarConversa,
}: {
  conversationId: string;
  onTrocarConversa?: (id: string) => void;
}) {
  const t = useT();
  const q = useConversation(conversationId, true);
  const conversa = q.data ?? null;
  const envio = useEnvioDaConversa(conversa);
  const [respondendo, setRespondendo] = useState<Respondendo | null>(null);

  if (q.isLoading) {
    return (
      <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("Carregando conversa…")}
      </div>
    );
  }
  if (!conversa) {
    return (
      <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {q.error && !isNotFound(q.error)
          ? t("Não foi possível carregar a conversa.")
          : t("Conversa não encontrada ou fora do seu acesso.")}
      </p>
    );
  }

  const provider = conversa.channel_sessions?.provider ?? null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatThread
          conversationId={conversa.id}
          provider={provider}
          onResponder={setRespondendo}
          dono={{
            userId: conversa.assigned_to_user_id ?? null,
            nome: conversa.assigned_to_user_name ?? null,
          }}
          contatoId={conversa.contacts?.id ?? null}
        />
      </div>
      <RetentionNotice conversationId={conversa.id} />
      {conversa.contacts?.id && onTrocarConversa && (
        <NumeroForaDoAr
          conversationId={conversa.id}
          channelSessionId={conversa.channel_session_id}
          contactId={conversa.contacts.id}
          contactPhone={conversa.contacts.phone_number ?? null}
          onAbrirConversa={onTrocarConversa}
        />
      )}
      {envio.motivoDaJanela && (
        <JanelaFechadaAviso conversationId={conversa.id} provider={provider} motivo={envio.motivoDaJanela} />
      )}
      <Composer
        key={conversa.id}
        conversationId={conversa.id}
        blockedReason={envio.blockedReason}
        janelaFechada={envio.motivoDaJanela}
        disabled={envio.fechada}
        contactName={conversa.contacts?.name ?? null}
        contactDisplayName={conversa.contacts?.display_name}
        respondendo={respondendo}
        onCancelarResposta={() => setRespondendo(null)}
        currentContactId={conversa.contact_id}
        initialDraft={rascunhoEmbutido(conversa.id)}
        onDraftChange={(texto, modo) => {
          if (modo === "reply") rascunhos.set(conversa.id, texto);
        }}
      />
    </div>
  );
}
```

Acrescentar ao espanhol e ao inglês: `"Carregando conversa…"` e `"Não foi possível carregar a conversa."`. `"Conversa não encontrada ou fora do seu acesso."` já existe (InboxLayout).

Run: `pnpm vitest run components/inbox/ConversaEmbutida.test.tsx && pnpm typecheck` → PASS.

- [x] **Step 3: Commit**

```bash
git add components/inbox/ConversaEmbutida.tsx components/inbox/ConversaEmbutida.test.tsx lib/i18n
git commit -m "feat(inbox): ConversaEmbutida — thread e composer da Inbox montáveis em outra tela"
```

---

### Task 6: "Abrir conversa" pode abrir no lugar

**Files:**
- Modify: `components/kanban/AbrirConversaDoLead.tsx` (Props e trecho ≈99-105)
- Test: `components/kanban/AbrirConversaDoLead.test.tsx` (criar; se já existir, acrescentar o caso)

**Interfaces:**
- Produces: prop opcional `onAberta?: (conversationId: string) => void`. Com ela, o componente NÃO navega para a Inbox.

- [x] **Step 1: Teste que falha**

```tsx
// components/kanban/AbrirConversaDoLead.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { AbrirConversaDoLead } from "./AbrirConversaDoLead";

describe("AbrirConversaDoLead com onAberta", () => {
  it("entrega o id da conversa e não navega para a Inbox", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { conversation_id: "conv-9" } }), { status: 200 }),
    );
    const onAberta = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AbrirConversaDoLead contactId="k1" phone="5585999999999" variante="dossie" onAberta={onAberta} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onAberta).toHaveBeenCalledWith("conv-9"));
    expect(push).not.toHaveBeenCalled();
  });
});
```

Run → FAIL (`onAberta` ignorado; `push` chamado).

- [x] **Step 2: Implementar**

Na interface `Props`:

```ts
  /**
   * Quem já tem onde mostrar a conversa (o dossiê do funil) recebe o id aqui e
   * fica na tela. Sem isto, o comportamento de sempre: ir para a Inbox.
   */
  onAberta?: (conversationId: string) => void;
```

Desestruturar `onAberta` na assinatura e, logo depois do `await qc.invalidateQueries({ queryKey: ["board"] });`:

```ts
      if (onAberta) {
        onAberta(json.data.conversation_id);
        return;
      }
      router.push(`/app/inbox?id=${json.data.conversation_id}`);
```

Conferir que o estado `abrindo` volta a `false` no caminho do `return` (se o reset vive num `finally`, nada a fazer; senão, chamar `setAbrindo(false)` antes do `return`).

Run: `pnpm vitest run components/kanban/AbrirConversaDoLead.test.tsx components/kanban/ConversaSlot.test.tsx` → PASS.

- [x] **Step 3: Commit**

```bash
git add components/kanban/AbrirConversaDoLead.tsx components/kanban/AbrirConversaDoLead.test.tsx
git commit -m "feat(kanban): Abrir conversa aceita abrir no lugar (onAberta)"
```

---

### Task 7: Dossiê com a conversa ao lado; fechar volta ao funil ativo

**Files:**
- Modify: `components/kanban/LeadDossier.tsx` (SheetContent ≈82-202)
- Modify: `components/kanban/KanbanBoard.tsx` (≈154 e ≈330-333)
- Test: `components/kanban/LeadDossier.test.tsx` (criar)

**Interfaces:**
- Consumes: `ConversaEmbutida`, `rascunhoEmbutido` (Task 5); `AbrirConversaDoLead` com `onAberta` e `temAlvoParaAbrir` (Task 6).
- Produces: nenhuma API nova; mudança de layout e de fechamento.

- [x] **Step 1: Teste que falha**

```tsx
// components/kanban/LeadDossier.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/inbox/ConversaEmbutida", () => ({
  ConversaEmbutida: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="conversa-embutida">{conversationId}</div>
  ),
}));
// Mocks dos hooks que o LeadDossier já usa: copiar o arranjo de
// components/kanban/*.test.tsx (ex.: OwnerBadge.test.tsx) para useT, useUser,
// useActiveOrg, useLeadTimeline e useTagDeIdioma.

import { LeadDossier } from "./LeadDossier";
import { leadDeTeste } from "./__fixtures__/lead"; // criar a partir de lib/types/leads.ts

describe("LeadDossier com conversa", () => {
  it("negócio com conversa: monta a conversa embutida", () => {
    render(<LeadDossier open onOpenChange={() => {}} lead={leadDeTeste({ conversa: { id: "c1", preview: "oi", last_message_at: null, unread: 0 } })} />);
    expect(screen.getAllByTestId("conversa-embutida")[0]).toHaveTextContent("c1");
  });

  it("negócio sem contato e sem telefone: sem painel de conversa (o dossiê não alarga)", () => {
    render(<LeadDossier open onOpenChange={() => {}} lead={leadDeTeste({ conversa: null, contact_id: null, contact: null })} />);
    expect(screen.queryByTestId("conversa-embutida")).toBeNull();
    expect(screen.queryByRole("region", { name: "Conversa" })).toBeNull();
  });

  it("Esc dentro de um campo de texto não fecha o dossiê", () => {
    const onOpenChange = vi.fn();
    render(<LeadDossier open onOpenChange={onOpenChange} lead={leadDeTeste({ conversa: { id: "c1", preview: null, last_message_at: null, unread: 0 } })} />);
    const campo = document.createElement("textarea");
    screen.getByRole("dialog").appendChild(campo);
    campo.focus();
    campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
```

Completar as props obrigatórias de `LeadDossier` conforme a interface real (`sed -n 24,60p components/kanban/LeadDossier.tsx`). A fixture `leadDeTeste(over)` devolve um `Lead` mínimo válido com `over` aplicado.

Run: `pnpm vitest run components/kanban/LeadDossier.test.tsx` → FAIL.

- [x] **Step 2: Implementar o layout**

Em `LeadDossier.tsx`:

```tsx
import { useState } from "react";
import { ConversaEmbutida } from "@/components/inbox/ConversaEmbutida";
import { AbrirConversaDoLead, temAlvoParaAbrir } from "./AbrirConversaDoLead";
import { cn } from "@/lib/utils";

// dentro do componente, antes do return:
  const [conversaId, setConversaId] = useState<string | null>(lead.conversa?.id ?? null);
  const contatoId = lead.contact_id ?? null;               // ajustar ao nome real do campo
  const telefone = lead.contact?.phone_number ?? null;     // idem
  const temPainel = Boolean(conversaId) || temAlvoParaAbrir(contatoId, telefone);
  const [aba, setAba] = useState<"negocio" | "conversa">("negocio");

  const painelDaConversa = conversaId ? (
    <ConversaEmbutida conversationId={conversaId} onTrocarConversa={setConversaId} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">{t("Este negócio ainda não tem conversa.")}</p>
      <AbrirConversaDoLead contactId={contatoId} phone={telefone} variante="dossie" onAberta={setConversaId} />
    </div>
  );
```

E o `SheetContent`:

```tsx
      <SheetContent
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          temPainel ? "sm:max-w-md lg:max-w-[min(72rem,95vw)]" : "sm:max-w-md",
        )}
        // Esc num campo de texto tira o foco do campo, não fecha o painel:
        // quem digita uma resposta e aperta Esc para fechar um emoji/menção não
        // pode perder o dossiê inteiro. Um segundo Esc, já fora do campo, fecha.
        onEscapeKeyDown={(e) => {
          const alvo = document.activeElement;
          if (alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLInputElement) {
            e.preventDefault();
            alvo.blur();
          }
        }}
      >
        {temPainel && (
          <div role="tablist" aria-label={t("Seções do negócio")} className="flex gap-1 border-b border-border p-2 lg:hidden">
            {(["negocio", "conversa"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={aba === a}
                onClick={() => setAba(a)}
                className={cn(
                  "min-h-11 flex-1 rounded-md text-sm font-medium",
                  aba === a ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {a === "negocio" ? t("Negócio") : t("Conversa")}
                {a === "conversa" && (lead.conversa?.unread ?? 0) > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                    {lead.conversa?.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className={cn("min-h-0 flex-1", temPainel && "lg:grid lg:grid-cols-[minmax(22rem,26rem)_1fr]")}>
          <div className={cn("h-full overflow-y-auto p-6", temPainel && aba !== "negocio" && "hidden lg:block")}>
            {/* Mover para cá, sem alterar, os filhos que hoje estão direto no
                SheetContent (linhas ≈94-200): SheetHeader, ContatoDoNegocio,
                ConversaNoDossie, ScoreSlot, LeadFieldsForm, TarefasDoNegocio,
                PropostasDoNegocio e LeadTimeline. */}
          </div>
          {temPainel && (
            <section
              aria-label={t("Conversa")}
              className={cn("h-full min-h-0 flex-col border-border lg:flex lg:border-l", aba === "conversa" ? "flex" : "hidden")}
            >
              {painelDaConversa}
            </section>
          )}
        </div>
      </SheetContent>
```

Notas:
- O `ConversaNoDossie` (link "Abrir conversa no Inbox") continua na coluna do negócio. Ele vira o caminho para a tela completa.
- Se o `SheetContent` atual tem `p-6` próprio, o `p-0` acima zera e o `p-6` passa para a coluna do negócio, para a conversa ir de borda a borda.
- Acrescentar ao espanhol e ao inglês: `"Este negócio ainda não tem conversa."`, `"Seções do negócio"`, `"Negócio"` e `"Conversa"`.

- [x] **Step 3: Fechar volta ao funil ativo e atualiza o quadro**

Em `KanbanBoard.tsx`:

```tsx
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

// no corpo:
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const fecharDossie = useCallback(() => {
    setDossieId(null);
    // A resposta enviada pelo dossiê muda a prévia e o contador do card.
    void qc.invalidateQueries({ queryKey: ["board"] });
    // Tira o deep link: recarregar a página não pode reabrir o dossiê fechado.
    if (searchParams.get("lead")) {
      const qs = new URLSearchParams(searchParams.toString());
      qs.delete("lead");
      router.replace(qs.size ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [qc, pathname, router, searchParams]);
```

E no `<LeadDossier …>` (≈330):

```tsx
        <LeadDossier
          key={leadDoDossie?.id}
          /* …props atuais… */
          onOpenChange={(v: boolean) => !v && fecharDossie()}
        />
```

O `key` remonta o dossiê ao trocar de negócio: o `conversaId` e a aba não vazam de um card para o outro.

Se o `KanbanBoard` já usa `useRouter` ou `useQueryClient`, reaproveitar as instâncias em vez de declarar de novo (`grep -nE "useRouter|useQueryClient|useSearchParams" components/kanban/KanbanBoard.tsx`).

- [x] **Step 4: Rodar**

```bash
pnpm vitest run components/kanban components/inbox hooks/inbox "app/app/pipelines"
pnpm typecheck && pnpm lint
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add components/kanban lib/i18n
git commit -m "feat(funil): responder a conversa pelo dossiê do negócio sem sair do quadro"
```

---

### Task 8: Prova pela tela, registro e gates completos

**Files:**
- Create: `tests/e2e/funil-conversa-no-dossie.spec.ts`
- Modify: `.github/workflows/e2e.yml` (uma `SPECS_PARTE_*`), `docs/testing/user-journey-map.md`
- Create: `.changes/funil-direto-e-conversa-no-dossie.md`, `evidence/funil-conversa-no-dossie/*.png`

- [x] **Step 1: Spec e2e** (arranjo de login e seed copiado de `tests/e2e/followup-dossie.spec.ts`, que já abre o dossiê com um negócio semeado)

```ts
// tests/e2e/funil-conversa-no-dossie.spec.ts
import { expect, test } from "@playwright/test";
// importar os MESMOS helpers de login/seed que followup-dossie.spec.ts usa

test.describe("Funil: aba abre o padrão e o dossiê responde a conversa", () => {
  test("Funis → quadro do padrão → troca por pílula → card → responder → fechar fica no funil", async ({ page }) => {
    // arrange: org com 2 funis (padrão "Vendas" + "Pós-venda") e um negócio
    // em "Pós-venda" com contato e conversa (seed igual ao followup-dossie)

    await page.goto("/app/kanban");
    await expect(page).toHaveURL(/\/app\/pipelines\/[0-9a-f-]+$/);
    await expect(page.getByRole("link", { name: "Funis" })).toHaveAttribute("aria-current", "page");

    const seletor = page.getByTestId("trocar-funil");
    await expect(seletor.getByRole("link", { name: "Vendas" })).toHaveAttribute("aria-current", "page");
    await seletor.getByRole("link", { name: "Pós-venda" }).click();
    await expect(seletor.getByRole("link", { name: "Pós-venda" })).toHaveAttribute("aria-current", "page");
    const urlDoFunil = page.url();

    await page.getByText("Negócio de teste").click();
    const dossie = page.getByRole("dialog");
    const conversa = dossie.getByRole("region", { name: "Conversa" });
    await expect(conversa).toBeVisible();

    const caixa = conversa.getByRole("textbox").first();
    await caixa.fill("Resposta enviada pelo funil");
    await caixa.press("Enter");
    await expect(conversa.getByText("Resposta enviada pelo funil")).toBeVisible();
    await page.screenshot({ path: "evidence/funil-conversa-no-dossie/01-respondido-no-dossie.png" });

    await page.keyboard.press("Escape"); // 1º Esc: sai do campo
    await page.keyboard.press("Escape"); // 2º Esc: fecha o dossiê
    await expect(dossie).toBeHidden();
    expect(page.url()).toBe(urlDoFunil);
    await expect(page.getByTestId("trocar-funil").getByRole("link", { name: "Pós-venda" })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: "evidence/funil-conversa-no-dossie/02-de-volta-ao-funil.png" });
  });
});
```

O seletor da caixa de texto e a tecla de envio devem ser os que as specs da Inbox usam (`grep -rn "getByRole(\"textbox\"" tests/e2e/inbox*.spec.ts | head`).

- [x] **Step 2: Registrar a spec no CI e rodar o gate de cobertura**

Acrescentar `funil-conversa-no-dossie.spec.ts` à `SPECS_PARTE_*` mais curta de `.github/workflows/e2e.yml`.

```bash
pnpm vitest run tests/unit/e2e-cobertura-completa.test.ts
```

- [x] **Step 3: Prova em ambiente fresco estilo VPS** (doutrina de QA Visual; receita em CLAUDE.md)

`baseline.sql` num Supabase local pg15 + `scripts/bootstrap-owner.ts`, depois `next build && next start`, sem envs opcionais. Rodar a spec. Medir por ferramenta, no Playwright, em 1280×768 e 390×844:

```ts
await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
  return { largura: d.width, alturaDoComposer: document.querySelector('[role="dialog"] textarea')!.getBoundingClientRect().bottom <= innerHeight };
});
```

Critério: a 1280px o dossiê mostra as duas colunas e o composer cabe sem rolar a página. A 390px a alternância "Negócio | Conversa" aparece e as pílulas não estouram a largura (`scrollWidth <= clientWidth` do `body`).

- [x] **Step 4: Registro**

```markdown
<!-- .changes/funil-direto-e-conversa-no-dossie.md -->
---
impacto: capacidade_nova
secao: adicionado
titulo: A aba Funis abre direto o funil padrão, e o negócio responde a conversa sem sair do quadro
---

Clicar em Funis abre o quadro do funil padrão. Com até quatro funis, a troca é feita por botões no topo do quadro; com mais, por uma lista. A lista com todos os funis, de onde se cria, arquiva e importa, continua em "Todos os funis". Ao abrir um negócio, a conversa do contato aparece ao lado, com o mesmo campo de resposta da Inbox (anexos, modelos, notas e avisos de janela). Ao fechar, você continua no mesmo funil. Negócio sem conversa mostra o botão para iniciar uma ali mesmo.
```

Em `docs/testing/user-journey-map.md`, na jornada do funil, acrescentar o caso `[P1] Responder pelo dossiê e voltar ao funil ativo`, apontando para a spec nova e para a pasta `evidence/`.

**Destino (DoD 18):** núcleo. Sem a feature, o quadro e a Inbox continuam inteiros, mas o funil é tela do dia a dia de todo nicho. Não é extensão.

- [x] **Step 5: Suíte inteira (a autoridade é o exit code)**

```bash
pnpm typecheck && pnpm lint && pnpm lint:channels
pnpm test:unit > /tmp/vt.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/vt.log | tail -3
grep -aE "^ *FAIL " /tmp/vt.log | sed 's/ > .*//' | sort | uniq -c
pnpm build
pnpm playwright test tests/e2e/funil-conversa-no-dossie.spec.ts tests/e2e/pipelines-gestao.spec.ts tests/e2e/qa-l12-troca-de-funil.spec.ts tests/e2e/followup-dossie.spec.ts
pnpm release:conferir
```

Comparar com a linha de base da Task 0. Só conta como verde se nenhum arquivo NOVO falhou.

- [x] **Step 6: Revisão e PR no fork**

Despachar `react-reviewer` e `code-reviewer` no diff (`git diff origin/main...HEAD`). Corrigir CRITICAL/HIGH. Depois:

```bash
git add -A tests/e2e .github/workflows/e2e.yml docs/testing .changes evidence
git commit -m "test(funil): prova pela tela da aba Funis e da conversa no dossiê"
git push -u origin feat/funil-direto-e-conversa-no-dossie
gh pr create -R axis-digital/DeskcommCRM --base main \
  --title "feat(funil): aba abre o funil padrão + responder pelo dossiê" \
  --body-file /tmp/pr-body.md   # resumo, decisões, evidência, destino: núcleo, plano de teste
```
