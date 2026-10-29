-- manifest: **Privilégios explícitos de `integration_sync_state` (tabela do fork criada na 9005, que ficou fora da 9037).** A partir de 30/10/2026 a Supabase deixa de conceder permissão automática a tabela nova; sem este bloco, uma instalação nova do baseline nasce com a tabela inalcançável para o servidor (42501) e a sincronização de pedidos da Nuvemshop para de gravar o estado. Do tamanho do uso: a pessoa logada só lê (a RLS filtra pela organização), o servidor lê e grava, o visitante sem login não alcança. Idempotente.

-- 9039 — grants explícitos de integration_sync_state
--
-- Por quê: o invariante `grants-explicitos-das-tabelas-do-apendice` (que veio da
-- upstream com a 9037) reprova toda tabela do apêndice sem `grant` próprio, e esta,
-- criada pela 9005 do fork, nunca o teve. Nenhuma mudança de comportamento hoje:
-- numa instalação que já existe os privilégios já estão lá pelo default ACL antigo.

revoke all on table public.integration_sync_state from anon, authenticated, service_role;
grant select on table public.integration_sync_state to authenticated;
grant select, insert, update, delete on table public.integration_sync_state to service_role;
