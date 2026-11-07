---
impacto: nada_mudou
secao: corrigido
titulo: O painel de novo agendamento leva ao mês com vaga também depois de trocar o tipo
---

No último dia útil do mês, depois do último horário, o painel de "Novo
agendamento" já passava sozinho para o mês seguinte. Isso falhava quando a
pessoa trocava de tipo: o painel abre no primeiro tipo por nome, que pode não ter
jornada publicada, e a decisão de abrir no mês seguinte era gasta nessa primeira
resposta, que não dizia nada sobre vaga. Quem escolhia depois o tipo com jornada
ficava num calendário de outubro sem nenhum dia aceso, com o próximo horário
escondido atrás da seta. Agora a decisão só é tomada quando chega uma resposta
conclusiva (jornada publicada, sem erro). Nada muda na VPS — a correção chega
pela atualização normal.
