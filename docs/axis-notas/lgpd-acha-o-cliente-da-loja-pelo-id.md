---
impacto: nada_mudou
secao: corrigido
titulo: "O apagamento e a cópia dos dados do titular encontram o cliente da loja pelo id da Nuvemshop"
---

Quando a Nuvemshop pede o apagamento ou a cópia dos dados de um cliente, o sistema agora localiza o contato pelo id do cliente na loja, que é o dado que a sincronização realmente guarda. Antes só a busca por e-mail funcionava: um contato sem e-mail, ou com outro e-mail, ficava de fora do pedido do titular. Se o mesmo id aparecer em mais de um contato, a busca não escolhe nenhum e usa o e-mail, para nunca anonimizar a pessoa errada. Também deixa de reescrever a origem de quem já é cliente da loja quando ele chama pelo WhatsApp vindo de uma página com UTM.
