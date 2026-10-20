# Auditoria de UI, navegação e configurações — Roteiro

> **Status (2026-10-20): NÃO INICIADO.** Nenhuma das 13 fases foi executada. O que saiu daqui até agora foi o pedido pontual "funil direto e conversa no dossiê" ([plano próprio](2026-10-15-funil-direto-e-conversa-no-dossie.md), executado e em produção), que corresponde ao achado de porta duplicada do funil (princípio 2). A Fase 1 (linha de base medida) continua sendo o primeiro passo.

> Plano de **descoberta e priorização**, não de implementação. Cada achado que virar mudança ganha um plano próprio no formato de `2026-10-15-funil-direto-e-conversa-no-dossie.md` (TDD, prova pela tela, PR no fork).

**Goal:** Reduzir o ruído visual e tornar óbvio onde fica cada tela, função e configuração. A medida é um número antes/depois, não uma opinião.

**Escopo:** shell (sidebar, barra inferior, ⌘K, hubs), Configurações (25 telas sob `app/app/settings`), CRM (funil, dossiê, contatos), Inbox e onboarding. Medido na `upstream/main` em 2026-10-15: **71** destinos no catálogo (`lib/navigation/catalogo.ts`), **21** com `sidebar: true` e **6** grupos (Atendimento, CRM, IA, Canais, Análise, Organização).

**Fora de escopo:** identidade visual e marca (white-label, `docs/white-label.md`), schema e API.

## Princípios (o que conta como "melhor")

1. **Um nome por coisa.** O catálogo já registra o custo de não seguir isso: "Kanban", "Pipelines", "Funis" e "quadro" eram nomes da mesma coisa.
2. **Uma porta óbvia por tarefa, e no máximo duas por tela.** Hoje o funil tem três: a lista "Funis", "Etapas do funil" e o onboarding.
3. **Hierarquia por frequência de uso.** O que se usa todo dia fica na sidebar; o que se configura uma vez fica no hub ou em Configurações.
4. **Ausência não ocupa espaço.** Esta regra já existe no código (`ConversaSlot`, `ConversaNoDossie`); a auditoria cobra que ela valha no resto.
5. **Medido por ferramenta, nunca a olho** (`getBoundingClientRect`/`getComputedStyle` no Playwright), como pede a doutrina de QA Visual.

## Ferramentas e onde cada uma entra

| Fase | Ferramenta | Para quê |
|---|---|---|
| Inventário | `codegraph` (`codegraph_files`, `codegraph_search`) + `git grep` no catálogo | Mapa real de telas, portas e rótulos |
| Inventário | Playwright MCP (`browser_navigate`, `browser_snapshot`, `browser_evaluate`) | Árvore de acessibilidade e métricas de cada tela |
| Diagnóstico | skill `impeccable` (modos critique, audit, distill, clarify) | Hierarquia visual, carga cognitiva, textos, estados vazios |
| Diagnóstico | skill `click-path-audit` | Cliques até concluir cada tarefa P0/P1 e portas mortas |
| Diagnóstico | skill `accessibility` + agente `a11y-architect` | WCAG 2.2: foco, contraste, alvo de toque, landmarks |
| Diagnóstico | skill `product-lens` | Ordem dos grupos por frequência de uso |
| Desenho | `superpowers:brainstorming` → `superpowers:writing-plans` | Uma proposta por achado priorizado, com plano |
| Desenho | `frontend-design`, `make-interfaces-feel-better`, `design-system` | Ajuste fino, microinterações, tokens em `app/globals.css` |
| Execução | `superpowers:subagent-driven-development` + `superpowers:test-driven-development` | Implementação por task, com revisor a cada passo |
| Revisão | agentes `react-reviewer`, `code-reviewer`, `a11y-architect` | Antes de cada PR |
| Prova | `browser-qa`, agente `e2e-runner`, `tests/e2e/*.spec.ts` | Prova pela tela (DoD 12), evidência em `evidence/` |
| Fechamento | `superpowers:verification-before-completion` | Gates completos antes de declarar pronto |

## Fase 1 — Linha de base (medir antes de mexer)

- [ ] **1.1 Ambiente fresco** estilo VPS (receita do CLAUDE.md): `baseline.sql` + `bootstrap-owner.ts` + `next build && next start`, sem envs opcionais. Criar 3 usuários (`admin`, `manager`, `agent`), porque a navegação muda por papel (`minRole`).
- [ ] **1.2 Inventário de navegação**, um JSON por papel em `evidence/auditoria-ui/inventario-<papel>.json`: para cada destino do catálogo, `{ href, label, grupo, seção, sidebar, minRole, alcançávelPor: ["sidebar"|"hub"|"⌘K"|"link interno"] }`.
- [ ] **1.3 Métricas por tela** com o Playwright (`browser_evaluate`), a 1280×768 e 390×844, gravadas em `evidence/auditoria-ui/metricas.csv`:
  - elementos interativos visíveis acima da dobra;
  - tamanhos de fonte distintos e cores de texto distintas (`getComputedStyle`);
  - headings (h1–h3) e se há exatamente um `h1`;
  - largura de rolagem horizontal (`scrollWidth > clientWidth`);
  - alvos de toque < 44px no celular.
- [ ] **1.4 Tarefas cronometradas em cliques** (`click-path-audit`), do login até concluir:
  1. responder o lead mais recente de um funil;
  2. mover um negócio de etapa e marcar perdido com motivo;
  3. criar um funil novo com 4 etapas;
  4. mudar a janela de disparo de um canal;
  5. convidar um usuário como agente;
  6. trocar o prompt de um agente de IA;
  7. ver a conversão do funil no mês.
- [ ] **1.5 Screenshots de referência** em `evidence/auditoria-ui/antes/`.

## Fase 2 — Diagnóstico

- [ ] **2.1** `impeccable` em modo critique nas 10 telas mais usadas (Inbox, Funil, Dossiê, Contatos, Configurações › hub, Canais, Agentes de IA, Análise, Onboarding, Tarefas). Uma ficha por tela: ruído, hierarquia, textos, estados vazios e de erro.
- [ ] **2.2** `click-path-audit` sobre as 7 tarefas: portas duplicadas, becos sem saída e passos que não anunciam o próximo.
- [ ] **2.3** Vocabulário: `git grep` dos rótulos do catálogo contra os `h1` e os botões das telas. Listar onde a mesma coisa tem dois nomes.
- [ ] **2.4** Acessibilidade (`a11y-architect`): landmarks, ordem de foco, contraste nos dois temas e alvos de toque.
- [ ] **2.5** Consolidar em `docs/audits/2026-10-XX-ui-navegacao.md` uma tabela de achados: `{ id, tela, problema, evidência, impacto (alto/médio/baixo), esforço (P/M/G), proposta }`.

## Fase 3 — Priorização e planos

- [ ] **3.1** Ordenar por impacto ÷ esforço, com a primeira impressão (P0) acima de tudo, como manda a doutrina.
- [ ] **3.2** Apresentar ao dono os 5–8 primeiros para aprovação. Mudança de nome ou de lugar na navegação é decisão de produto.
- [ ] **3.3** Para cada aprovado: `superpowers:brainstorming` → plano próprio em `docs/superpowers/plans/` → execução → PR no fork.

## Recomendações iniciais (hipóteses a validar na Fase 2)

Achados já medidos no código são marcados **[medido]**. O resto é hipótese que a auditoria confirma ou derruba.

| # | Recomendação | Por quê | Esforço |
|---|---|---|---|
| R1 | **[medido]** Item ativo da sidebar reconhece o quadro do funil (`ativoEm`) | Em `/app/pipelines/<id>` nenhum item fica ativo (`Sidebar.tsx:330` compara só prefixo de `href`). Está incluído no plano do funil (Task 2) | P |
| R2 | **[medido]** Unificar "Todos os funis" e "Etapas do funil" numa tela "Funis" com abas (Funis · Etapas · Motivos de perda · Vocabulário) | Duas telas sobre as mesmas linhas de `crm_pipelines`; o próprio catálogo registra a confusão entre elas | M |
| R3 | Configurações com **busca no topo** e agrupamento por intenção ("Minha empresa", "Equipe e acesso", "Canais", "Automação", "Dados e privacidade") | 25 telas; quem procura uma configuração lembra do QUE quer mudar, não de em qual grupo ela mora | M |
| R4 | **Densidade do card** do funil: alternar "Compacto / Detalhado", lembrado por usuário | O card disputa espaço entre ~8 elementos (comentário do `ConversaNoDossie`); o compacto mostra só título, valor, dono e não lidas | M |
| R5 | **Cabeçalho fixo no dossiê**: etapa, valor, dono e próxima ação sempre visíveis; seções recolhíveis (Campos, Propostas, Tarefas, Linha do tempo) | Com a conversa ao lado, a coluna do negócio precisa caber em 26rem sem rolar para achar o essencial | P |
| R6 | **Padrão de página único**: `h1` + uma linha de descrição (vinda do `description` do catálogo) + ações à direita | O catálogo já tem `description` por tela; reaproveitar dá consistência e ensina a tela sem tutorial | P |
| R7 | **Contadores só quando > 0** e um único estilo de selo | Selo "0" é ruído; vários estilos de selo competem pela atenção | P |
| R8 | **⌘K como porta de configuração**: buscar "janela de disparo" leva direto ao campo, não só à tela | Configurações profundas viram uma busca, não uma caça | M |
| R9 | **Lembrar o último funil** (opcional, depois da Decisão 1 do plano do funil) | Quem trabalha o dia todo num funil que não é o padrão volta a ele sem clicar | P |
| R10 | **Onboarding aponta para as portas reais**: cada passo concluído mostra onde aquilo mora depois | Primeira impressão (P0): o usuário sai do onboarding sem saber onde ficaram as coisas | M |

## Critérios de sucesso (comparar Fase 1 × depois)

- Cliques medianos nas 7 tarefas: **−30%**.
- Tarefas com mais de uma porta ambígua: **0**.
- Telas com mais de 1 `h1` ou sem `h1`: **0**.
- Tamanhos de fonte distintos por tela: **≤ 4**; cores de texto distintas: **≤ 3** (fora estados semânticos).
- Rolagem horizontal a 390px: **0** telas.
- Nenhuma regressão nos gates: `navegacao-completude`, `i18n-*`, `e2e-cobertura-completa`, `tailwind-tokens`.

## Ordem sugerida

1. Plano do funil (`2026-10-15-funil-direto-e-conversa-no-dossie.md`), que já resolve R1.
2. Fase 1 e Fase 2 da auditoria, em paralelo à revisão do PR do funil.
3. R5 e R7 (baratos e visíveis), depois R2, R3, R6, R4, R8, R10.
