---
impacto: capacidade_nova
secao: corrigido
titulo: Envio de imagem e arquivo pelo CRM via WAHA não trava mais em servidor sem hairpin
---

Para enviar mídia, o WAHA baixa a URL assinada do Storage antes de responder, e essa URL nasce com o endereço público da instalação. Em servidor onde um container não alcança o IP público do próprio host (hairpin), a conexão nunca abria: todo envio de imagem, arquivo, áudio ou vídeo feito pelo CRM terminava em `waha_timeout ... /api/sendImage` depois de 30 segundos, e só o que saía pelo celular chegava. A nova variável opcional `WAHA_MEDIA_BASE_URL` (ex.: `http://caddy`) faz o WAHA baixar pelo endereço interno; só a origem da URL muda, o caminho e o token da assinatura seguem iguais, e mídia de outro domínio não é tocada. Vazia, o comportamento é o de antes — nenhum `.env` existente precisa mudar. Junto: o upload de anexo pela Inbox deixou de mostrar "Erro inesperado. Tente novamente." quando a resposta não é JSON; agora o aviso traz o status real. Nenhuma mudança de banco.
