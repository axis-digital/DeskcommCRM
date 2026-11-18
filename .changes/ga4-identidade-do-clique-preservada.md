---
impacto: nada_mudou
secao: corrigido
titulo: A identidade do Google Analytics do clique volta a chegar até o contato
---

Quando o site liga o rastreio com GA4, o clique no botão de WhatsApp leva o
identificador do visitante (client_id) e da sessão. Depois da última atualização
do sistema esse par era descartado ao gravar o clique, e o contato nascia sem ele,
então o ganho não era reportado à mesma sessão do site. Agora o par é guardado de
novo, só quando vem no formato do cookie do Google Analytics. Nada a fazer na
instalação.
