---
impacto: nada_mudou
secao: corrigido
titulo: Conexão por QR em WAHA compartilhado volta a receber mensagens se o webhook da sessão for apagado
---
Quando o WAHA é compartilhado e o webhook fica gravado na própria sessão, uma alteração feita por fora na configuração da sessão (um ajuste de proxy, por exemplo) podia apagá-lo: a conexão seguia como conectada e enviando normalmente, mas as mensagens recebidas deixavam de chegar, sem nenhum aviso. Agora o CRM confere o webhook ao reconectar e na verificação periódica de saúde das conexões, e o recoloca sozinho, preservando os webhooks de outros sistemas que usam o mesmo WAHA. A recolocação fica registrada no log. A reação do cliente (`message.reaction`) também passa a ser assinada nesse modo. Nada a fazer na atualização.
