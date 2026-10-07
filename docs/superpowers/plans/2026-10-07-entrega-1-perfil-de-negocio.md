# Entrega 1 — Perfil do negócio, objetivo por funil e mapeamento automático GA4

> Execução: 4 agentes em paralelo, cada um em worktree e branch próprios (`feat/e1-a..d`), a partir de
> `feat/perfil-de-negocio-ga4`. Integração, gates completos e revisão: sessão orquestradora.
> Design aprovado: `docs/superpowers/specs/2026-10-07-perfil-de-negocio-e-eventos-design.md`
> (Seção 1 — Componentes, aprovada em 2026-10-07 com "execute a entrega um").

## Fundação (FEITA, commit `4fe1668f7`) — contrato que todos importam, NÃO editar

- `lib/onboarding/perfil-de-negocio.ts` — `CANAIS_DE_VENDA`, `OBJETIVOS_DO_NEGOCIO`,
  `perfilDeNegocioSchema`, `lerPerfilDeNegocio(org.settings)`, `lerObjetivoDoFunil(pipeline.settings)`,
  `pacoteDoObjetivo()`, `rotuloDoObjetivo()`, `MAX_FUNIS_POR_OBJETIVO = 3`.
- `lib/conversoes/mapa-de-eventos-ga4.ts` — `eventoDeEtapaSugerido(objetivo, passo)`,
  `eventoDaVendaDoObjetivo(objetivo)` (null = padrão da conexão).
- `lib/conversoes/regras-ga4.ts` — vocabulário de etapa ganhou `view_item`, `add_to_cart`, `schedule`,
  `close_unconvert_lead` (o CHECK do banco entra no workstream C).
- Persistência: perfil em `organizations.settings.perfil_de_negocio`; objetivo em
  `crm_pipelines.settings.objetivo`. Sempre MERGE no jsonb (nunca sobrescrever `settings` inteiro).

## Workstreams

### A — Perfil no welcome e em Configurações
Posse: `app/onboarding/welcome/**`, `app/actions/onboarding/acceptWelcome.ts`, `lib/schemas/onboarding.ts`
(só `welcomeSchema`), tela de Configurações da organização (`app/app/settings/tenant/**` ou onde a org é
editada), action nova `app/actions/settings/updatePerfilDeNegocio.ts`.
1. Welcome: dois grupos de múltipla escolha (canais, objetivos; ≥1 objetivo), ao lado de "O que vocês fazem?".
2. `acceptWelcome` valida com `perfilDeNegocioSchema` e grava em `organizations.settings.perfil_de_negocio` (merge).
3. Configurações: seção "Perfil do negócio" editável; action com Zod, RBAC admin, `requireSupportWrite`, audit
   `organization.business_profile_updated`.
4. Testes unit (action, schema do welcome) + caso e2e escrito.

### B — Funis por objetivo no passo "funil" e objetivo no editor de funil
Posse: `app/actions/onboarding/montarQuadro.ts`, `app/onboarding/funil/**`, sugestão de funil por IA
(`sugerirFunil` e prompt), editor/configurações de funil (onde o funil é renomeado/editado).
1. Funil padrão = 1º objetivo do perfil (fluxo atual). Prompt da IA recebe canais/objetivos.
2. Objetivos extras (até 3 funis no total): checkbox "Também criar funil de <objetivo>", criado do
   `pacoteDoObjetivo()`, com etapas e `agent_stage_hint`. Reusar o caminho existente de criação de funil;
   NÃO criar SQL novo sem avisar (número 0904 é do workstream C; se precisar, usar 0905 e reportar).
3. Todo funil criado/aplicado grava `settings.objetivo` (merge).
4. Editor de funil: select "Objetivo do funil" (com "Sem objetivo").
5. Testes unit + caso e2e escrito.

### C — Banco e handler do GA4
Posse: `supabase/migrations/<ts>_0904_*.sql`, `supabase/baseline.sql` (apêndice), `lib/conversoes/ga4.handler.ts`,
`tests/invariants/**` do GA4, `lib/database.types.ts` se preciso.
1. Migration 0904: ampliar `ga4_conversion_rules_evento_conhecido` com os 4 eventos novos; conferir se
   `ad_conversion_dispatches` ou outra tabela tem CHECK de `ga4_event_name`/`ga4_event` e ampliar também.
   Linha `-- manifest:`; apêndice idempotente no baseline (drop constraint if exists + add).
2. `ga4.handler.ts`: evento da venda = `eventoDaVendaDoObjetivo(objetivo do funil do negócio)` ??
   `ga4_won_event` da conexão. `transaction_id` = lead.id quando `purchase`. Reenvio segue o retrato.
3. Confirmar que regra em etapa `lost` dispara (`close_unconvert_lead`); se o handler filtrar, ajustar.
4. Testes: unit do handler (objetivo produto→purchase, serviço→close_convert_lead, sem objetivo→conexão);
   invariante do CHECK novo; `vocabulario-banco-x-typescript` verde. `pnpm test:db` dos arquivos tocados.

### D — Painel "Regras sugeridas" na tela do GA4
Posse: `app/app/settings/conversoes/_regrasGa4.tsx` e arquivo novo `_regrasSugeridasGa4.tsx`,
`lib/conversoes/regras-sugeridas-ga4.ts` (puro), action nova `app/actions/settings/aplicarRegrasSugeridasGa4.ts`.
1. Função pura: funis (com objetivo) × etapas (com passo) × regras existentes → propostas
   `{stageId, evento, jaTemRegra}`. Etapa sem passo ou sem sugestão fica de fora.
2. Painel: por funil, lista etapa → evento sugerido, pré-marcado; "Aplicar" cria SÓ onde não há regra
   (nunca sobrescreve). Aparece quando a conexão GA4 existe.
3. Action: Zod, mesmo RBAC/`requireSupportWrite`/audit da action de regras GA4 existente; revalida que cada
   stage pertence à org (organization_id do contexto, nunca do body).
4. Testes unit (pura + action) + caso e2e escrito.

## Regras para todos os agentes
- Doutrina: `CLAUDE.md` do repo (multi-tenancy, audit, `requireSupportWrite`, sem `console.log`, Zod).
- TDD: teste vermelho primeiro, depois verde.
- i18n: textos novos em pt-BR na tela via `traduzir`; espanhol num bloco NO FIM de `DICIONARIO`
  (`lib/i18n/dicionario.ts`) com comentário `// ---- Entrega 1 / workstream X ----`.
- Memória da máquina é limitada: rode só os testes dos arquivos tocados (`pnpm vitest run <arquivos>`) e no
  máximo um `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` no fim. Não rodar `pnpm test:unit` inteiro
  nem `next build` (o orquestrador roda).
- Commits convencionais na própria branch; não fazer push, não mesclar.
- Relatório final: arquivos tocados, commits, testes rodados com contagem, o que NÃO foi feito/medido.

## Integração (orquestrador)
Merge `feat/e1-c`, `-d`, `-a`, `-b` em `feat/perfil-de-negocio-ga4`; `pnpm test:unit` (exit code),
`pnpm test:db`, typecheck, lint; fragmento `.changes/`; revisão; prova pela tela no staging.
