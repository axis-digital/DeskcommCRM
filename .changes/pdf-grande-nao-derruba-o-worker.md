---
impacto: nada_mudou
secao: corrigido
titulo: PDF muito grande deixa de poder derrubar o worker por falta de memória
---
O leitor de PDF limitava a memória de trabalho do processo que extrai o texto, mas não o tamanho do arquivo em si, que fica fora desse limite. Um PDF de dezenas de MB recebido pelo WhatsApp ou enviado à base de conhecimento podia estourar a memória do contêiner do worker e derrubá-lo. Agora PDF acima de 10 MB é recusado antes de ser aberto, com a mensagem "PDF grande demais para extrair texto", e o worker segue de pé. Nada a fazer na atualização.
