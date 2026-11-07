---
impacto: capacidade_nova
secao: adicionado
titulo: A Nuvemshop passa a trazer o catálogo de produtos da loja, e a mostrar quantos já chegaram
---
Em Integrações › Nuvemshop, abaixo dos pedidos, aparece o bloco Catálogo com quantos produtos da loja já foram sincronizados e quando o mais recente foi atualizado. O catálogo chega quando você conecta a loja e a cada "Sincronizar agora", e se mantém em dia sozinho: criar, editar ou apagar um produto na Nuvemshop reflete aqui em instantes, e uma conferência a cada 30 minutos pega o que algum aviso da loja tenha perdido. A conferência não percebe um produto apagado na loja cujo aviso se perdeu; "Sincronizar agora" também não o remove. Os avisos de produto que ficavam parados desde a conexão da loja são processados na atualização. Corrigido também o registro de auditoria dos avisos da Nuvemshop (nuvemshop.webhook_received), que nunca chegava a ser gravado. Nada a fazer na atualização.
