# Prazo do cliente MySQL — regressão do PR #75

Destino: núcleo. A correção protege o módulo de banco externo já existente;
nenhuma extensão precisa ser ativada para o restante do CRM continuar inteiro.

## Garantia e causa observada

Quem consulta uma tabela externa precisa receber resultado ou erro dentro do
prazo, sem perder as próximas leituras do pool. O job `integracao-mysql` do
PR #75 falhou em `tests/mysql/dialeto.test.ts`: `SLEEP(25)` levou 25.007 ms,
acima da asserção de 20 s, apesar de `max_execution_time=10000` na sessão.

O mesmo teste original passou localmente em cerca de 10 s, no MySQL 8.0.46.
Portanto, não se atribui uma causa interna específica ao servidor da CI.
O defeito confirmado é a ausência de um prazo independente no cliente:
se o servidor não encerra a consulta, o chamador e a conexão ficam esperando.

## RED e GREEN

| Garantia                                                           | Evidência                                                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Configuração, execução, commit e rollback não prendem o empréstimo | RED: `conexao.test.ts`, 4 falhas previstas e 11 aprovações; após 10 s os quatro casos permaneciam pendentes                       |
| O prazo independe do limite do servidor                            | RED em MySQL 8.0.46 real: dica `MAX_EXECUTION_TIME(60000)` com `SLEEP(25)` terminou após 25 s e não rejeitou                      |
| Sessão vencida é descartada, nunca liberada com comando pendente   | GREEN: os mesmos 15 testes unitários passaram; timeout com `PROTOCOL_SEQUENCE_TIMEOUT`, `destroy()` chamado e `release()` ausente |
| Uma leitura seguinte no mesmo pool continua funcionando            | GREEN: 16 testes de `dialeto.test.ts` passaram contra MySQL real, incluindo prazo de 10 s e leitura posterior                     |
| Demais caminhos do módulo continuam funcionando                    | 29 arquivos e 402 testes aprovados em `lib/external-db`                                                                           |

Checkpoint RED: `f13d15ff2`. Checkpoint GREEN: `b62d7522f`. A primeira versão
da asserção da leitura posterior esperava um número, mas o driver retorna
texto; foi corrigida para aceitar a representação configurada do MySQL.
O limite temporal permaneceu o mesmo.

Comandos usados (variáveis `MYSQL_TEST_*` apontando somente para o contêiner
efêmero local `deskcomm-mysql-pr75-timeout`):

```bash
pnpm vitest run lib/external-db/dialetos/mysql/conexao.test.ts
pnpm test:mysql tests/mysql/dialeto.test.ts
pnpm vitest run lib/external-db --coverage --coverage.include=lib/external-db/dialetos/mysql/conexao.ts
```

Nesta máquina foram executados os binários locais de Vitest, TypeScript e
Next já instalados. Cobertura do arquivo de conexão MySQL: 81,31% de
instruções, 92,2% de linhas, 73,52% de branches e 65,21% de funções. As
funções não cobertas incluem caminhos de cache, fora deste conserto.

Validação final: a suíte MySQL completa passou com **69/69 testes em 5
arquivos**, em MySQL 8.0.46. Typecheck, lint dos arquivos alterados, build de
produção, conferência do fragmento de release e guardas documentais passaram.
O build concluiu sem exigir alteração de configuração da instalação.

Sabotagem depois do commit: elevar apenas o prazo do cliente para 30 s
reproduziu exatamente as 4 falhas previstas dos testes com relógio simulado
(11 casos continuaram aprovados). A fonte foi restaurada byte a byte e o
reteste voltou a 15/15. Isso confirma que os casos guardam o prazo real,
e não apenas a presença do `SET SESSION`.

## Limites e Living System Checklist

1. Entrada/saída: `criarDialetoMysql` alimenta `lerTabelaMysql` e
   `executarReceitaMysql`, que usam `consultarMysql`; o resultado ou erro
   retorna aos consumidores REST e MCP existentes.
2. Registro/superfície/porta: o sucesso conserva a auditoria da rota de
   tabela; a falha segue como `upstream_unavailable` (HTTP 502) na rota
   `connections/[id]/tables/[schema]/[tabela]` e `falha_na_leitura` nas
   receitas MCP. A tela permanece em `/app/integracao-dados`.
3. Anti-morte/configuração: prazo fixo de 10 s por sessão emprestada,
   incluindo rollback; não cria configuração nem tela nova. O prazo não
   inclui a fila de aquisição do pool nem garante cancelamento imediato
   da execução remota. As travas de sessão do servidor são mantidas.
4. Continuidade/retorno: o erro retorna ao consumidor existente; a sessão
   vencida sai do pool, permitindo nova leitura com outra conexão. Não
   há retry automático, mensagem ao cliente final ou decisão IA/humano
   nova nesta correção.
5. Mapa e prova: nó `pool` atualizado em
   `docs/architecture/banco-de-dados-externo.architecture.json`.
   Não se alterou schema/RLS; não se aplicou migration em instalação.
   Não foi feita prova visual nem prova em par pelo agente nesta rodada;
   o PR continua em rascunho por essas pendências da integração maior.
