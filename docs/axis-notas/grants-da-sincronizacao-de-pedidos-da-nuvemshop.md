---
impacto: nada_mudou
secao: corrigido
titulo: A sincronização de pedidos da Nuvemshop continua gravando o próprio estado em instalações novas depois da mudança da Supabase de 30/10
---

A partir de 30/10/2026 a Supabase deixa de dar permissão automática a tabela nova. A tabela em que a sincronização de pedidos da Nuvemshop guarda o andamento (cursor, trava e último erro) não tinha a permissão explícita, e uma instalação nova a partir dessa data não conseguiria gravá-la. Agora ela recebe a permissão do tamanho do uso: o servidor lê e grava, a pessoa logada só lê o que é da sua organização, e quem não está logado não alcança. Quem já tem o sistema instalado não percebe diferença. Nada muda na VPS.
