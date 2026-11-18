# Sincronização upstream — 16/11/2026

## Verificação do coordenador — estado mais recente

**Preparação local validada; aguardando Gate 2 para commit, push e PR rascunho.**
Branch `merge/upstream-2026-11-16`, na worktree isolada criada pelo Orca.
O usuário aprovou a preparação com base `main`. Nenhum commit, push, PR remoto,
merge remoto ou deploy foi feito. Esta sincronização é pré-requisito da
issue #70; **o aviso da organização sem IA ainda não foi implementado**.

| Verificação | Resultado medido |
| --- | --- |
| Build e tipos | Build de produção E2E passou contra Supabase fresco; `pnpm typecheck` passou com heap de 8 GB, incluindo testes. |
| Lint, canais, papéis e kit | Lint global passou com zero erros; um aviso novo de import de tipo foi corrigido e o lint dos últimos arquivos passou. `lint:channels`, `lint:role-rank`, `test:shell` e sintaxe do harness de update passaram. Há dívida de warnings preexistente. |
| Unitários | A rodada integral terminou com 42.692 testes passando e 24 falhando em seis arquivos. Todos esses arquivos foram corrigidos e a reexecução focada passou: 25 testes em sete arquivos, incluindo um controle já verde. Não houve nova rodada integral depois dessas correções. As cercas completas posteriores passaram: 377 arquivos, 4.018 testes, com skips declarados pelo runner. |
| Banco | Rodada integral: 681 arquivos e 5.566 testes passaram; uma comparação de paridade de trecho LGPD falhou. O bloco 9902 foi movido integralmente para antes do bloco 9243, sem mudar os bytes SQL e permanecendo antes da varredura de privilégios. A reexecução de LGPD, site_events e Nuvemshop passou: três arquivos, 50 testes, com install/update e conferência do kit verdes. `pnpm test:db:update` passou novamente sobre o baseline final, incluindo a comparação da linha inteira do aviso do fork. Não houve nova rodada integral dos 682 arquivos após o movimento do bloco. |
| Tela | Quatro specs em Supabase fresco: nove casos passaram e um encontrou perda do respiro do dossiê. A correção de 20 px passou no reteste. A Nuvemshop foi repetida após restaurar a descrição traduzida de onde o catálogo fica e passou. São dez casos de aceite aprovados ao combinar rodadas; não uma nova rodada conjunta após todas as correções. |

Capturas desta execução, separadas das evidências históricas:

- [Contato editado no dossiê](docs/evidence/sync-upstream-2026-11-16/dossie-respiro.png)
- [Pedidos, catálogo e destino da fonte](docs/evidence/sync-upstream-2026-11-16/nuvemshop-catalogo.png)
- [Convite de notificações](docs/evidence/sync-upstream-2026-11-16/inbox-convite-notificacoes.png)
- [Moeda persistida](docs/evidence/sync-upstream-2026-11-16/moeda-persistida.png)

Os serviços da bancada Supabase foram encerrados por projeto exato, sem tocar
staging ou produção. O receptor da Nuvemshop é um dublê HTTP; não foram provados
OAuth, entrega a WhatsApp real, IA com modelo pago nem o carregamento do acervo
com credencial real. As capturas provam os fluxos semeados descritos nas specs.
Os artefatos históricos sobrescritos pelos testes foram restaurados ao índice;
os novos arquivos automáticos ficaram arquivados em `/tmp`.

### Compatibilidade do banco e limite explícito

A 9904 repõe a união do CHECK no fim da cadeia; migrations aplicadas não foram
reescritas. A prova adicional com o harness de update preservou um aviso
`integracao_desautorizada` durante reaplicações do baseline. Essa garantia foi
incorporada a `scripts/test-update-com-dados.sh`, comparando a linha inteira
antes e depois; a rodada sobre o posicionamento final do bloco também passou.

O caminho histórico pelo Supabase CLI continua incompatível com esse dado do
fork antes da forward-fix: PostgreSQL reproduziu 23514 na 9327 e no bloco exato
de CHECK da 9333. Não é resolvido por acrescentar a 9904 depois delas. O kit
self-host usa baseline; `scripts/local-supabase.sh` também pula a cadeia
histórica. Não declarar a cadeia compatível nem suprimir dados para contorná-la.

O bloco 9902 movido mede 119 linhas e mantém SHA256
`d3107eefd65c15e142e415c9060415c2c00fd999c5cfe1f8ea1604ccdac7ffa7`.
A paridade de LGPD deixa de incluir SQL do fork no intervalo de uma migration
upstream; nenhum teste de LGPD foi afrouxado.

### Revisão e limites

As resoluções preservam as integrações, os guards, o tema e o catálogo de ícones
do fork. Google e Telegram usam os vetores originais Phosphor com licença MIT,
não ícones genéricos. A correção PDF do PR #65, commit `6aea87c20`, foi
reaproveitada apenas no teste, com as mesmas asserções de texto, estratégia e
memória; nenhuma nota de release daquele PR foi trazida.

`git diff --check` das resoluções passa. O diff integral staged apontou onze
espaços/finais de linha em arquivos idênticos à upstream; não se reescreveu
migration aplicada para limpar espaço. Contra a upstream há ainda uma quebra
Markdown por dois espaços herdada de documento do fork. Auditoria de
dependências: zero high/critical, dez moderate e um low. Não é uma auditoria
linha a linha dos milhares de arquivos importados da upstream.

Destino desta preparação: infraestrutura e compatibilidade do núcleo. Não cria
nova porta, configuração ou decisão automática própria. A tela existente
`/app/integrations/nuvemshop` conserva o link para
`/app/ai/knowledge/sources`; o Inbox e o dossiê permanecem consumidores dos
dados existentes. Logs e auditoria de operações existentes foram preservados.

### Gate 2 — proposta concreta, ainda sem autorização

Commit proposto: `chore(sync): integra upstream de 16/11 preservando recursos do fork`.

PR proposto **somente** em `axis-digital/DeskcommCRM`, head
`merge/upstream-2026-11-16`, base `main`, como rascunho. A CI deve executar
novamente as suítes integrais sobre a árvore publicada antes de qualquer merge.
O PR é pré-requisito da issue #70 e não a encerra.

Os workers encerraram seus turnos e os terminais próprios foram fechados após
evidência positiva de término. As entregas Codex ficaram nos relatórios locais:
o sandbox dos workers não alcançou o runtime para confirmar `worker_done`, e os
Dispatches foram encerrados pela recuperação, não declarados sucesso por falta
de recibo. A revisão OpenCode não foi aprovada como evidência técnica. O
coordenador verificou os resultados diretamente; não há worker ativo nem
terminal reclamável no Run `run_76085f83ef62`.

| Task | Desfecho da execução e evidência |
| --- | --- |
| `task_531bfedad4cc` — sync Codex | Entrega de transporte falhou; turno encerrado e resultado registrado pelo coordenador. Resoluções e validação local neste relatório; Gate 2 pendente. |
| `task_87f1e286f608` — primeira revisão OpenCode | Reportou sucesso, mas o coordenador rejeitou o conteúdo por falta de evidência; terminal reutilizado para correção. |
| `task_c8475ad71b4c` — revisão corrigida OpenCode | Reportou sucesso; continuou com afirmações sem suporte e não foi aprovada. Aviso explícito no relatório da worktree da issue; terminal liberado. |
| `task_6b97e32d1ea2` — teste da timeline Codex | Entrega de transporte falhou; correção local aceita e três testes passaram no coordenador. Evidência em `sync-timeline-test-1116.md`; terminal encerrado. |
| `task_be452fba3b04` — fixtures Codex | Entrega de transporte falhou; correções locais aceitas, 23 testes passaram e a descrição da Nuvemshop foi provada novamente pela tela. Evidência em `sync-fixtures-componentes-1116.md`; terminal encerrado. |

Texto proposto: "Atualiza o fork de `b38a59e47` para incluir `upstream/main`
em `087061e97`, preservando GA4, Nuvemshop, eventos do site, conversa no dossiê,
notificações e tema. Resolve os conflitos, restaura o vocabulário de avisos com
a 9904 e mantém a descrição traduzida do destino do catálogo. Os resultados e
limites de validação estão neste relatório, incluindo o caminho de migrations
históricas com dados do fork. Sem deploy."

### Autoavaliação da preparação

Precisão 4/5: resultados separados por rodada e limitações explícitas; falta uma
rodada integral posterior a todas as correções. Completude 2/5 frente ao pedido
original: base preparada, feature #70 pendente do gate de publicação da base.
Clareza 4/5: evidência atual precede o registro histórico abaixo. Acionabilidade
4/5: commit e PR rascunho concretos, dependem de aprovação. Concisão 4/5: detalhes
de revisão ficam neste artefato. Média 3,6/5. A principal melhoria é concluir a
publicação e verificação da base para executar as fatias da feature aprovada.

## Registro histórico do worker — anterior à consolidação

- Base do fork `origin/main`: `b38a59e474ef1ae2d74edd9abaa84217ce8d1dd1`; ponta `upstream/main`: `087061e973277eecd03f32a29956e873363435a1`; ancestral: `c9b2f487ab9b266f5ad95bcd833be413067e9b3f`. São referências locais, não verificação de atualidade remota.
- Merge `--no-commit --no-ff` iniciado pelo coordenador; nenhuma alteração foi commitada ou enviada. O coordenador registrou os 29 caminhos conflitantes; `git ls-files -u` está vazio. Alterações posteriores, inclusive a nova 9904, ainda precisam ser adicionadas e revisadas no índice.
- Comparação entre pontas: 3.280 arquivos, 299.016 inserções e 52.403 remoções. `git diff --cached --stat` antes de registrar resoluções: 2.757 arquivos, 280.484 inserções e 8.991 remoções; não é o diff final.

## Conflitos e decisões

Os seguintes caminhos tiveram conflitos; as resoluções no disco ainda precisam de revisão, registro no índice e validação integrada:

- `.github/workflows/e2e.yml`
- `app/api/v1/anuncios/google/[org]/route.ts`
- `app/api/v1/integrations/nuvemshop/callback/route.ts`
- `app/app/integrations/nuvemshop/page.tsx`
- `app/app/settings/conversoes/page.tsx`
- `app/app/settings/tenant/page.tsx`
- `app/app/settings/tenant/pipelines/_client.tsx`
- `app/layout.tsx`
- `components/connections/ConnectionsClient.tsx`
- `components/inbox/ChannelLogo.tsx`
- `components/inbox/InboxLayout.tsx`
- `components/inbox/MessageBubble.tsx`
- `components/kanban/ContatoDoNegocio.tsx`
- `components/kanban/LeadDossier.tsx`
- `hooks/inbox/useSendMessage.ts`
- `hooks/inbox/useUploadMedia.ts`
- `lib/i18n/dicionario.ts`
- `lib/plataformas-de-anuncio/google/atribuicao.ts`
- `lib/plataformas-de-anuncio/google/captura-de-clique.ts`
- `lib/ui/icons.ts`
- `lib/waha/ingest.ts`
- `next.config.ts`
- `pnpm-lock.yaml`
- `supabase/baseline.sql`
- `tests/e2e/moeda-da-organizacao.spec.ts`
- `tests/invariants/lgpd-redact-unificado-alcanca-pelo-catalogo.test.ts`
- `tests/unit/branding.test.ts`
- `tests/unit/channel-adapter-waha.test.ts`
- `tests/unit/navegacao-registry.test.ts`


As decisões combinam o GA4 do fork com a normalização de metadados Google da upstream; a extração ocorre no caminho comum de pós-entrada, sem consumir o recibo duas vezes. A tela Nuvemshop conserva pedidos e catálogo do fork e acrescenta o estado do acervo upstream. Inbox combina notificações e envio existente com as opções novas; dossiê conserva a conversa embutida e inclui os blocos da página e contatos relacionados. O catálogo Axis mantém Lucide; marcas existentes de WhatsApp, Instagram e Messenger preservam seus vetores; Telegram e Google usam vetores Phosphor preenchidos com licença MIT preservada no código; a prova visual integrada continua pendente. `CLAUDE.md` preserva a regra do dono (PR somente no fork e faixa de migration do fork). O bloco de `site_events` da 9902 foi mantido antes da varredura de privilégios do baseline, junto aos blocos upstream.

O coordenador informou que regenerou o lockfile com pnpm e instalou dependências com `--frozen-lockfile --ignore-scripts` fora do sandbox. A tentativa local sem rede falhou por `EAI_AGAIN`; não serve como evidência de versão inexistente. Não validar o lockfile pelo índice enquanto ainda estiver não resolvido.

## Schema: bloqueio material

A árvore combinada contém 740 arquivos de migration, sem números canônicos nem timestamps duplicados localmente; PRs remotos em voo não foram medidos. A cadeia de migrations termina com a 9333, que omite `integracao_desautorizada` do CHECK de `agent_inbox_items`; o baseline canônico mantém esse valor. As 9327 e 9333 reconstroem a constraint omitindo valor já existente no fork: os testes de igualdade e monotonicidade falham. A nova forward-fix é `supabase/migrations/20261116190000_9904_uniao_inbox_kind_apos_upstream.sql`; a lista é igual à união do bloco canônico já presente no baseline. O baseline tem um bloco canônico único; não se deve adicionar uma segunda reconstrução que quebre reaplicação.

**Limite de upgrade:** uma forward-fix depois da 9333 não impede que o `ADD CHECK` da 9327 ou 9333 falhe antes ao aplicar a cadeia em banco que já contenha avisos com `integracao_desautorizada`. Não editar migrations aplicadas e não remover ou alterar dados para contornar. O caminho de instalação/atualização por baseline é separado do caminho Supabase CLI e ambos precisam de prova; o teste de banco executado pelo coordenador permanece em andamento. Decidir uma solução segura para a cadeia com dados antes de declarar compatibilidade.

## Verificação

- `git diff --check`: passou para as alterações no disco; `git ls-files -u` vazio; mudanças posteriores ainda não estão todas registradas.
- `pnpm vitest run` em Google captura/metadados, adapter WAHA e registro de navegação: 4 arquivos, 78 testes passaram.
- Testes focados no dossiê, contato e etapa: 4 arquivos, 46 testes passaram.
- Cercas de número de jornada e espera em contexto E2E: 2 arquivos, 6 testes passaram; GA4 fork virou J69 e Nuvemshop fork J70.
- ESLint focado no catálogo, dicionário e nos três imports apontados: exit 0.
- Typecheck local com heap padrão: exit 134 por falta de memória. Rodada do coordenador com 8 GB apontou cinco exports ausentes e três chaves duplicadas; corrigidos; o coordenador informou typecheck 8 GB aprovado.
- As três cercas de CHECK passaram: 3 arquivos, 9 testes; as perdas históricas foram justificadas sem ocultar o risco de upgrade. Testes de marca do canal e navegação: 2 arquivos, 38 testes passaram.
- O coordenador informou lint com 0 erros e 725 avisos, shell e lint de canais e roles aprovados.
- Banco: coordenador informou install e update iniciais verdes, mas a conferência do kit falhou por descoberta de release via rede e foi reiniciada com release informada. Resultado final, E2E e prova visual não medidos por este trabalhador.
- `orca orchestration check`: `runtime_unavailable`; mensagens foram registradas em `docs/handoffs/sync-status.md` conforme instrução do coordenador.

## Rascunho de PR local — não publicar

**Título:** `chore: sincronizar upstream no fork Axis`

**Descrição:** Sincroniza a upstream na base do fork e conserva integrações Nuvemshop, GA4 e identidade visual Axis. Documenta a reconciliação das migrations e a validação dos caminhos de instalação e atualização; preencher os resultados finais e o risco da cadeia com dados antes de propor o PR. Nenhum commit, push, PR remoto ou merge remoto está autorizado nesta etapa.

**Próximos passos para o coordenador:** concluir teste de banco; resolver o risco de aplicação de migrations com dados; repetir typecheck, lint e testes afetados; revisar UI e branding; registrar as alterações posteriores no índice e verificar `git ls-files -u` vazio e `git diff --check`.


## Ajuste visual após E2E local

O E2E `funil-conversa-no-dossie.spec.ts` passou 9/10; no caso da linha 261, o `paddingTop` da seção Contato ficou em 12 px, abaixo dos 20 px já presentes em `origin/main`. Restaurei `className="py-5"` no `SecaoDoDossie` real em `components/kanban/LeadDossier.tsx`, mantendo a exigência do teste intacta. O coordenador fará rebuild e reteste; não rodei testes que pedem escalada. Nenhum commit ou push foi feito.
