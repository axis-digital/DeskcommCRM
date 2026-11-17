# Teste da timeline por organização — sincronização de 16/11

O dublê registra em `registroDaAtividade` somente filtros de `crm_lead_activities`; as demais tabelas recebem registros independentes. A asserção exata dos dois filtros de organização e os três casos existentes foram preservados. Nenhuma rota foi alterada.

`pnpm vitest run lib/contacts/timeline-do-contato-por-organizacao.test.ts` antes da correção: 1 falhou e 2 passaram, pois quatro filtros eram registrados. Depois: 3 passaram no sandbox; a execução fora do sandbox ainda cabe ao coordenador.

Sabotagem temporária apenas no dublê: as consultas de atividades ignoraram `eq("organization_id", ...)`, tanto no registro quanto no predicado. O mesmo comando falhou em dois casos: a asserção esperava dois filtros e recebeu zero, e a atividade da outra empresa apareceu no resultado. O terceiro caso passou; a sabotagem foi removida após o teste. Isso simula a ausência simultânea dos filtros, sem modificar a rota compartilhada; não é uma execução contra banco real.

O comando Orca de consulta retornou `runtime_unavailable` no sandbox. Não houve pedido de escalada nem acesso a arquivos `.env*`.
