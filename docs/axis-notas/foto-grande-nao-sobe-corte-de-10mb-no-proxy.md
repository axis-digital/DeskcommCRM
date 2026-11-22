---
impacto: nada_mudou
secao: corrigido
titulo: Foto ou arquivo acima de 10MB agora sobe pela Inbox, até o limite de 50MB
---

O `proxy.ts` do Next bufferiza o corpo antes do handler e, no padrão, entrega só os primeiros 10MB. O upload de mídia de uma resposta passava por ali: uma foto de celular acima de 10MB chegava truncada e a rota respondia 422 "Campo 'file' (multipart) obrigatório", e a mensagem aparecia como "Não enviada". PDF e imagem pequena nunca notaram. O teto do corpo no proxy agora acompanha o limite de mídia (50MB mais 1MiB de margem do multipart), vigiado por teste. Nenhuma mudança de banco nem de variável de ambiente.
