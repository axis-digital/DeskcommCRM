# Prova pela tela do sync v1.94.0 no staging (28/10/2026)

Prova de tela dos três componentes que o merge do **PR #37** (`merge/upstream-2026-10-27`, `a3019b912`)
recompôs **à mão**: a bolha otimista de envio de mídia no `ChatThread`, o `LeadDossier` em duas colunas
e a `RevisaoDoDocumento` dentro dele. Nenhum dos três tinha cobertura além de typecheck e unit.

## O ambiente

O staging do fork, que roda a imagem construída da `a3019b912` (`APP_VERSION=1.94.0-fork-sync`),
com o `supabase/baseline.sql` aplicado sem nenhum erro. Conta de administrador da organização de teste,
em Chromium via Playwright, viewport 1440×900.

## O que cada arquivo prova

| arquivo                                       | o que prova                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-bolha-enviando.png`                       | Anexar uma imagem e clicar em **Enviar** desenha a bolha na hora, com a prévia do próprio arquivo e a legenda, ainda sem mensagem gravada. Medido: fase `enviando`, 280×250 px, dentro da thread, status "Enviando…".                                   |
| `02-bolha-falhou.png`                         | Quando o envio falha, a bolha **fica** com o arquivo e a legenda, troca o status para "Não enviada" (borda de erro) e oferece **Descartar** e **Tentar de novo**. Medido: fase `falhou`, 288×321 px.                                                    |
| `03-dossie-duas-colunas-revisao-simulada.png` | O dossiê do negócio abre em duas colunas: a conversa com o composer à esquerda; etapa, responsável, contato e "Dados do negócio" à direita. Medido no grid computado: `735px 416px`. Esta captura já traz a revisão do documento simulada (ver abaixo). |
| `04-revisao-do-documento-rolada.png`          | A mesma tela rolada até o bloco inteiro: a revisão fica **dentro** de "Dados do negócio", **acima** do formulário, com trecho citado, link do documento, campo de correção e os botões "Está certo, salvar" e "Descartar".                              |

## Como foi feito, e o que NÃO foi provado

- **Envio sem efeito externo.** O `POST /api/v1/messages` foi seguro por 6 s e abortado no navegador
  (`page.route`), então nada chegou ao servidor nem ao WhatsApp. Conferido no banco: 0 mensagens criadas
  na janela da prova. As capturas usam apenas o contato de teste `[TESTE] Cliente GA4` (telefone fictício).
  As outras conversas do staging têm contatos reais e **não aparecem** em nenhuma imagem.
- **A revisão do documento é simulada.** `GET` e `POST /api/v1/leads/:id/field-proposals` foram
  respondidos no navegador, porque o staging não tem extração pendente de documento. Isto prova a
  composição da tela, e o fluxo de salvar e de corrigir-e-salvar (o `POST` levou `decision=accept` e o
  valor corrigido; o bloco some quando a fila esvazia). **Não** prova o caminho do servidor.
- **O valor confirmado não aparece no formulário.** O funil de teste não tem campos personalizados, então
  `confirmarCampo` (que atualiza o campo) não tem onde mostrar o resultado. Segue coberto só por unit.
- O console mostra um `404` em `GET /api/v1/proposals?lead_id=…` ao abrir o dossiê. É por desenho: o módulo
  de propostas está desligado na organização de teste (`sePropostasDesligadas`).
