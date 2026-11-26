# Transcrição sob demanda — diagnóstico e aceite

Destino: núcleo. O gesto é comum ao inbox, não depende de nicho nem de provedor de canal.

## Diagnóstico da Axis Aceleradora em 26/11/2026

Consulta somente de leitura ao banco e presença de variáveis nos processos, sem ler valores de chaves. Nos últimos sete dias, 47 áudios recebidos tinham arquivo salvo e derivação `failed`; dois permaneciam sem status. Ao considerar também os áudios enviados, 71 tinham o motivo `transcription_402`. A empresa não tem agente publicado. O padrão de conversa é OpenRouter; a única credencial cadastrada é `openai-assinatura`. Não há binding específico de transcrição nem `TRANSCRIPTION_API_KEY`/`OPENAI_API_KEY` nos processos consultados.

O erro 402 é a recusa de cobrança do serviço de áudio. A assinatura conectada não fornece a credencial que a escada de transcrição utiliza. Para a configuração atual voltar a funcionar, quem administra a conta OpenRouter precisa verificar saldo e o limite de uso da chave. A [documentação do fornecedor](https://learn.openrouter.ai/courses/first-request/when-a-request-fails) também distingue a exceção de orçamento de chamadas simultâneas, que requer aguardar; os registros locais guardam somente o código 402 e não permitem distinguir essas causas. Como alternativa já suportada, uma chave **OpenAI de API**, com faturamento disponível, pode ser cadastrada em **Agente de IA → Credenciais** (`/app/ai/credentials`); a escada prefere essa chave à OpenRouter, sem exigir mudar o provedor da conversa. O resultado efetivo pode ser conferido em **Provedores de IA → Transcrição de áudio** (`/app/ai/providers`). Nenhuma credencial, saldo, configuração ou mensagem de produção foi alterada neste trabalho.

## Comportamento contratado

O áudio em conversa sob comando humano fica salvo e tocável. Não emite pedido de derivação automaticamente. Abaixo do player, **Transcrever** solicita a leitura. **Transcrevendo…** só aparece após um pedido explícito confirmado ou durante o envio desse pedido. O resultado concluído permanece salvo e é reutilizado. Reabrir a conversa não gera novo gasto.

Conversa cujo `comando_da_conversa` é `automatico` preserva a derivação automática para o agente entender o áudio. Em organizações com IA externa, os comandos `ninguem` e `aguardando` também preservam a transcrição automática, mesmo sem agente nativo publicado; `humano`, `travada` e `fechada` continuam exigindo clique. Ao devolver um atendimento humano para a IA, o dreno elegível reabre os áudios guardados sob demanda antes de responder, sem depender de clique posterior. Um clique humano nunca devolve a conversa ao automático nem dispara uma resposta ao cliente. A escada de fornecedores, custo, orçamento, retenção e salvaguardas LGPD continuam no worker existente.

Pedidos simultâneos travam a mesma mensagem antes de consultar a fila. Só o primeiro marca a mensagem e emite evento; ambos são confirmados na mesma transação. Falha ao enfileirar desfaz a marca. A conclusão tardia da persistência respeita a marca do pedido manual e não sobrescreve sua transcrição. A rota usa a organização autenticada; contatos pessoais, grupos, mídia expirada, revogada, anonimizada ou de outra organização não são enviados para transcrição.

Falhas aparecem com orientação sobre crédito, chave ou indisponibilidade e **Tentar novamente**. A tela acompanha a fila por consultas de dois em dois segundos, interrompe ao desmontar o balão e limita a espera a dez minutos. A tentativa seguinte reutiliza um pedido ainda na fila. Áudio sem arquivo salvo ainda não oferece a ação: primeiro a persistência precisa concluir.

## Sistema Vivo

Entrada: botão do `MediaRenderer`; saída: `event_log → media-derive-worker → messages → GET/realtime → balão`. Registro: `api_audit_log`, ação `message.transcription_requested`, sem áudio ou texto. Acesso: inbox existente, sem tela nova. Anti-morte: retry/backoff da fila, estado terminal no worker, espera limitada e nova tentativa na tela. Continuidade: a ação manual preserva o atendente e não chama a retomada automática. Retorno: o erro leva à correção da configuração e a um novo pedido; o texto pronto impede novo gasto. Mapa: `docs/architecture/transcricao-sob-demanda.architecture.json`.

## Evidência

Os testes de regressão foram executados antes do conserto: seis casos falharam e a rota inexistente impediu a coleta da suíte da API. A execução final passou em 613 casos de 15 arquivos, seis invariantes de banco e uma spec de tela. Resultado e limites: [validação e capturas](../../evidence/transcricao-sob-demanda/validacao.md). Typecheck completo e build de produção continuam pendentes por falta de memória; o comando completo de banco encontrou SIGPIPE na conferência do kit. A prova visual é de desenvolvimento, com fornecedor sintético, e não representa a transcrição pública da conta da Axis funcionando.
