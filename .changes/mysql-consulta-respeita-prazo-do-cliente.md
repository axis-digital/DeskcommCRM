---
impacto: nada_mudou
secao: corrigido
titulo: "Consultas a um banco MySQL externo deixam de prender o atendimento quando o servidor demora"
---

O CRM passa a encerrar a espera por uma consulta MySQL após 10 segundos mesmo quando o servidor não aplica o seu próprio limite de tempo. A conexão que excedeu o prazo é descartada, e as próximas leituras podem usar outra conexão do mesmo pool. O erro segue aparecendo pelos caminhos existentes da integração de dados e do agente. Nenhuma configuração adicional é necessária.
