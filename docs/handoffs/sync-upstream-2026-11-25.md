# Sincronização da upstream v1.125.0 — 25/11/2026

## Escopo e destino

Preparação do PR solicitado no fork `axis-digital/DeskcommCRM`, base `main`,
branch `merge/upstream-2026-11-25`. Base do fork: `5c4f0d4a3`. A origem é a
tag `v1.125.0` (commit `a21ab7272`), conforme a regra do dono registrada no
PR #74; não se importou a ponta posterior da upstream. Nenhum deploy é parte
desta entrega. O carregamento gradual das etapas fechadas do board continua
como trabalho separado, após a atualização da base.

Destino: **infraestrutura e compatibilidade do núcleo**. A operação comum
continua disponível sem ativar uma extensão. Os fragmentos de release da
upstream são importados pelo merge; esta preparação não cria uma capacidade
adicional que precise de fragmento próprio.

## Resoluções preservadas

Os 17 conflitos do merge foram resolvidos na sessão anterior. A combinação
mantém GA4, Nuvemshop, eventos do site, notificações, tema e conversa embutida
no dossiê do fork, incorporando os novos blocos de classificação e vendas.
`ContatoDoNegocio` conserva a edição de nome/e-mail do fork e recebe o
formulário de links da upstream. As telas de transferência entre funis usam
o diretório de kanban do fork. O catálogo de ícones continua sem dependência
de `@phosphor-icons/react`.

O baseline foi reconstruído a partir da tag e das adições do fork: 795 linhas
adicionadas, nenhuma remoção contra a tag. Os blocos do fork ficam antes do
apêndice LGPD 9243; assim, os gatilhos de `site_events` já existem quando a
cascata é preparada e a varredura de privilégios continua no fim.

A nova migration 9906 recompõe a união de `agent_inbox_items.kind`, incluindo
`integracao_desautorizada` e `followup_descartado`, com `-- manifest:`. O
baseline contém essa união no bloco canônico único. Nenhuma migration antiga
foi editada para corrigir o vocabulário. Tipos e lockfile combinados foram
preparados na sessão anterior; não foram regenerados nesta retomada.

## Evidência recuperada dos logs locais

Resultados confirmados em `/tmp/merge-tools/`, não apenas no relato da sessão:

| Verificação                                      | Resultado                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` com heap de 10 GB               | Exit 0; heap padrão havia sido insuficiente                                                       |
| `pnpm lint`                                      | Exit 0; 0 erros, 857 avisos                                                                       |
| `pnpm lint:channels` e `pnpm lint:role-rank`     | Aprovados                                                                                         |
| `pnpm test:unit` integral após correções         | 4.227 arquivos aprovados, 2 ignorados; 49.442 testes aprovados, 1 falha esperada, 24 ignorados    |
| `pnpm cercas`                                    | 397 arquivos aprovados, 1 ignorado; 4.714 testes aprovados, 11 ignorados                          |
| `pnpm test:db` integral                          | 727 arquivos aprovados e 1 falhou; 6.058 testes aprovados, 1 falhou, 1 falha esperada, 1 ignorado |
| Reteste LGPD após reposicionar os blocos do fork | 25/25 aprovados; INSTALL e UPDATE do baseline aprovados com `ON_ERROR_STOP=1`                     |
| Quatro guardas de baseline após reposicionamento | 13/13 aprovados                                                                                   |
| `pnpm test:shell`                                | Aprovado                                                                                          |
| `pnpm release:conferir`                          | Aprovado, sem escrever release                                                                    |

Nesta retomada, `pnpm build` com heap de 10 GB terminou com exit 0, incluindo
compilação, TypeScript e geração das 72 páginas. A guarda documental passou
7/7 após criar este relatório. O build emitiu avisos de banco indisponível e
usou os fallbacks de marca/módulos previstos no código; não prova uma
instalação em execução conectada ao Supabase.

Os testes de banco usaram `CONFERENCIA_KIT_RELEASE=v1.125.0` porque a descoberta
automática da release falhou. A única falha integral era a extração textual do
bloco LGPD que incluía indevidamente os apêndices do fork. O reteste reexecutou
os modos INSTALL/UPDATE e o arquivo afetado. **Não houve nova rodada integral
de banco após essa correção.**

## Limites e pendências antes de aprovar

- `test:journeys` não iniciou os casos: falta `.e2e-creds.json`. E2E e prova
  visual desta integração não foram medidos; o PR deve ficar em rascunho.
  Não se afirma que o CI cobre automaticamente todas as jornadas de canal.
- `format:check` reprovou 7.466 arquivos; 5.892 estão fora do diff do merge.
  Isso comprova dívida preexistente, sem afirmar que toda a reprovação é
  preexistente. Não houve reformatação global. Esse comando não aparece nos
  workflows atuais.
- `git diff --cached --check` encontrou oito linhas em branco no fim de
  arquivos. Sete arquivos são idênticos à tag; o oitavo é `_common.sh` do kit.
  Isso fica declarado, sem reescrever arquivos importados só por espaço.
- `pnpm audit`: 8 vulnerabilidades moderadas, 1 baixa, nenhuma alta ou
  crítica. Dependências não foram atualizadas incidentalmente neste merge.
- A aplicação da cadeia histórica de migrations com dados do fork não foi
  medida nesta rodada. A 9906 corrige o estado final; não prova que CHECKs
  intermediários aceitam todos os valores já existentes. O caminho de
  instalação/atualização por baseline foi medido separadamente.

## Living System Checklist desta preparação

1. Entrada/saída: tag `v1.125.0` e base `5c4f0d4a3` alimentam a branch de
   integração; o consumidor é o PR do fork e sua CI, antes de chegar à `main`.
2. Registro/superfície/porta: commit de merge, este relatório e aba Checks
   do PR; acesso pela lista de pull requests de `axis-digital/DeskcommCRM`.
3. Anti-morte/configuração: rascunho com pendências explícitas de tela e CI;
   não há configuração nova criada pela resolução dos conflitos.
4. Continuidade/retorno: não se criou um handoff IA/humano novo. Falha de
   validação exige correção na branch e nova execução do caso afetado;
   o reposicionamento dos blocos LGPD é o retorno já aplicado nesta rodada.
5. Mapa: esta preparação não cria uma peça de runtime própria. Os mapas
   importados da upstream acompanham as respectivas implementações.
