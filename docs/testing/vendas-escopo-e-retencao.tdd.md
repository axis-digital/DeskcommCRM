# Vendas: escopo e retenção

Correção das duas observações da revisão do PR #75, no núcleo. A operação comum depende de isolamento de acesso e da exclusão de contatos funcionar sem apagar registros financeiros.

A migration 9907 e seu espelho idempotente no baseline fazem vendas ligadas a negócio consultar a RLS do próprio negócio. Venda sem negócio mantém a leitura por organização. A restrição que impedia as duas FKs de executar `ON DELETE SET NULL` foi removida; a API mantém a validação de destino obrigatório na criação. A migration 9449, já distribuída, não foi editada.

## Evidência

`pnpm test:db tests/invariants/vendas-escopo-e-retencao.test.ts` antes da correção: **6 falhas previstas e 5 testes aprovados**. As falhas reproduziram leitura/soma fora do escopo, fila invisível e exclusão bloqueada nos três formatos de vínculo. Commit RED: `71183a92f`.

Após a correção, o mesmo arquivo passou **11/11**. A rodada com `valor-do-negocio-pelas-vendas`, `gov-5e-lead-children-scope` e `lgpd-alcanca-fichas-fundidas` passou **50/50**, incluindo INSTALL e UPDATE do baseline com `ON_ERROR_STOP=1`. Commit GREEN: `649f3f686`.

Os testes unitários de `app/api/v1/vendas/route`, `lib/relatorios/painel-de-vendas` e `varredura-anon-e-o-ultimo-bloco` passaram **32/32**. Não há nova tela, rota, variável ou função pública.

## Checklist do sistema vivo

Entrada: cadastro existente em `/api/v1/vendas`, que exige um destino. Saídas: painel de vendas e leitura no dossiê, agora limitados pela RLS do negócio. A exclusão do pai conserva valor e data no registro financeiro. Auditoria e apresentação permanecem nos consumidores existentes. Laço de retorno: os invariantes novos reproduzem vazamento e exclusão bloqueada antes da correção e impedem sua regressão. Não há peça nova que exija arestas adicionais no mapa de arquitetura.
