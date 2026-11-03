# Plano: proxy individual do pool por sessão WAHA

**Estado:** proposta para revisão; nenhuma alteração de produção autorizada por este documento.  
**Objetivo:** cada nova sessão abrangida pela política recebe e confirma um proxy próprio do pool antes de iniciar. O proxy é aplicado em `config.proxy` daquela sessão, nunca como proxy de saída do app ou do contêiner inteiro.

## Evidências e limites

- O app principal usa a instância compartilhada `wa-ha`; o staging usa outra instância. Em medição de 30/10/2026, as sete sessões do principal tinham proxy; a sessão de staging não tinha. Uma sessão principal estava `FAILED`.
- Na mesma medição, o pool consultado em `rastreio_total.public.waha_proxy_pool` tinha 23 linhas válidas livres e duas atribuídas. Dos seis endereços distintos nas sete sessões principais, **cinco constavam livres no pool** e um constava atribuído. Duas sessões, uma `WORKING` e outra `FAILED`, compartilhavam esse último endereço. Uma das duas atribuições apontava para endereço diferente do configurado na respectiva sessão; a outra correspondia. A comparação é uma fotografia não transacional; repetir antes de qualquer mutação.
- O watchdog `SEDI4ra2485DTxPj` está ativo, consulta `wa-ha` a cada minuto e chama o provisionador quando vê sessão `STARTING`, `SCAN_QR_CODE` ou `WORKING` sem `config.proxy`. A leitura agregada encontrou 1.440 execuções `success` em 24 horas; isso não prova atribuição nem tráfego pelo proxy.
- O provisionador `aiDMswAK9S8G8yo0` atual faz GET, preserva a config no PUT e ignora sessões com proxy. Porém, seu filtro **não aceita `STOPPED`**; ele seleciona e atualiza o pool em operações separadas, inicia/reinicia a sessão, aguarda e valida status. A atualização condicionada a `status='livre'` não garante, por si só, uma atribuição por sessão nem trata todos os pontos de interrupção. Seu fluxo de rollback libera a linha antes de restaurar a config, criando janela de inconsistência. Precisamos testar a versão publicada e os ramos de erro; leitura do cadastro não prova efeito ao vivo.
- O watchdog libera atribuições ausentes na lista de uma única instância, sem confirmação independente de ausência. Antes de reutilizá-lo com várias instâncias ou reservas pré-start, sua limpeza precisa conhecer escopo e estados de operação. Um GET incompleto, vazio ou uma reserva ainda sem sessão não podem liberar um proxy em uso.
- Em [connect-waha.ts](../../../lib/channels/connect-waha.ts), a reserva do CRM cria a sessão remota com `start=false` e imediatamente chama `startExistingSession`. A reconexão também chama `startSession` em [reconnect/route.ts](../../../app/api/v1/channel-sessions/%5Bid%5D/reconnect/route.ts). Há que examinar também reconciliadores e reinício automático fora desses caminhos.
- O worker em [session-reconciler.ts](../../../lib/agent-engine/edge/crm/session-reconciler.ts) envia diretamente `POST .../start` para sessões `STOPPED` pertencentes ao CRM. A barreira no fluxo de conexão precisa cobrir também esse caminho; o `SEDI` observa apenas depois que a sessão já inicia.
- `WAHA_SESSION_PROXY` é lido pelo cliente do CRM como **um único valor fixo**, aplicado a `config.proxy` na criação. Não é o mecanismo de seleção por sessão do pool. Estar vazio não prova que a automação n8n está desativada; a resposta anterior que afirmou que toda sessão nova necessariamente ficaria sem proxy ignorou o watchdog.
- O histórico do projeto `wacrm` registra que, em 23/09, o acionamento foi suspenso por perda de webhooks e rollback durante o QR; em 25/09 foi restaurado na transição `connected`, após correções no provisionador. Ver [plano do wacrm](/root/projects/wacrm/docs/superpowers/plans/2026-09-24-waha-channels.md). Não foi localizado registro que prove a motivação expressa de criação do `SEDI`; sua finalidade é inferida dos nós.

## Escopo e decisões abertas

O alvo inicial é o WAHA compartilhado principal e os canais por QR do CRM. O `SEDI` observa todas as sessões desse WAHA, inclusive as possivelmente criadas por outros sistemas: identificar proprietários e acordar o escopo antes de alterar comportamento. Staging só entra após definir uma instância e pool isolados. Sessões já pareadas não serão reiniciadas ou terão IP trocado por esta análise.

**Decisão do usuário:** proxies já configurados em sessões ativas devem ser registrados no pool como em uso, preservando o proxy atual de cada sessão. Isso requer confrontar endereço e porta com o pool e vincular a atribuição à identidade da sessão, sem exibir credenciais.

**Premissas propostas para confirmação antes do rollout:** (1) proxy individual obrigatório por sessão, com exclusividade do endereço enquanto qualquer sessão o mantém configurado, inclusive `FAILED` e `STOPPED`; (2) na ausência do pool ou do provisionador, nova sessão permanece parada e apresenta erro recuperável; (3) instalações self-host comuns continuam sem dependência de n8n ou pool, e somente a instalação que habilitar o modo gerenciado exige proxy. A exclusividade de IP é uma proposta operacional, não uma garantia previamente fornecida pelo usuário. O tratamento de sessões `FAILED` e `STOPPED` continua em aberto: por segurança, não disponibilizar o endereço delas para outra sessão até essa decisão.

O período de quarentena, o limite de tentativas, a política para sessões antigas compartilhando IP e o procedimento de troca de IP de sessão pareada precisam ser decididos com o responsável pela operação. Não usar esses pontos como autorização para desconectar números.

## Fase 0 — inventário e contenção

1. Repetir em modo somente leitura a comparação entre **todas** as sessões de todas as instâncias que utilizam o pool, incluindo `STOPPED` e `FAILED`, e todas as linhas do pool. Registrar somente identificadores internos e contagens; nunca exportar senhas ou conversas.
2. Identificar endereços em uso e livres, atribuições divergentes, dois nomes para o mesmo endereço, linhas inválidas e sessões cujo proxy não pertence ao pool. Identificar quem criou cada sessão e quais workflows podem alterar o pool.
3. Preparar reconciliação dos proxies das sessões ativas: para cada endereço e porta com correspondência única no pool e sessão inequívoca, registrar a linha como `atribuido` àquela sessão, preservando a configuração do WAHA. Produzir antes uma prévia somente leitura e reapurar imediatamente antes da escrita. Proxies ausentes do pool, duplicados ou atribuídos a outra sessão são conflitos: impedir a reutilização e encaminhar para decisão, sem sobrescrever atribuição, alterar IP ou reiniciar sessão automaticamente.
4. Enquanto a reconciliação não estiver concluída, impedir novas reservas ou rotações que possam selecionar endereços usados; preparar e testar a contenção antes de aplicá-la. Qualquer mudança em produção exige revisão do inventário, transação e plano de retorno; não alterar sessões de clientes nesta fase.
5. Inventariar a versão **publicada** dos workflows, política de retenção de execuções, esquema e índices reais do pool, chamadas dos outros sistemas, regras de autenticação e backups. Conferir o workflow de rotação `Tmh6mINvw1JFeJd2`, que hoje seleciona livre e libera antigo antes de concluir PUT/restart. Não supor que mudar apenas o provisionador torne a rotação segura.

**Saída:** inventário revisado, mapa de propriedade e plano de reconciliação individual; não ativar a automação nova enquanto endereços configurados puderem ser entregues a outra sessão.

## Fase 1 — reserva e reconciliação transacionais

1. Definir identidade estável `(instância WAHA, session_name)` e estados persistentes como `reservado`, `aplicando`, `confirmado`, `incerto` e `quarentena`, com identificador de operação e lease. Verificar compatibilidade com os estados atuais e com todos os consumidores antes de migrar.
2. Em transação no banco dono do pool, reservar de forma atômica uma linha válida e livre com bloqueio de linha/`SKIP LOCKED`, e garantir no banco a unicidade de sessão e de atribuição ativa por proxy. Repetição da mesma identidade retorna a mesma reserva. Um conflito de concorrência deve tentar outro candidato ou sinalizar esgotamento, nunca atribuir o mesmo proxy a duas sessões.
3. HTTP não participa da transação: persistir intenção antes do PUT e confirmar depois. Timeout, falha de rede, encerramento de execução ou resposta ambígua vira `incerto`; reler WAHA e comparar identidade e proxy antes de decidir. **Nunca liberar apenas por timeout** ou por falha em confirmar: o PUT pode ter sido aplicado.
4. Liberar a reserva apenas quando o WAHA confirmar que o proxy não está configurado naquela sessão e nenhum outro proprietário o utiliza, ou após ausência exata e confirmação conforme política. Uma sessão em `FAILED` ou `STOPPED` ainda detém o proxy. Exclusão, logout, arquivamento e restauração têm efeitos distintos: definir e testar cada um.
5. Manter versionamento de schema e rollback do banco do pool próprio, com backup, pré-checagem de duplicidades e migração aditiva. A tripla migration/baseline do DeskcommCRM aplica-se apenas a alterações no seu banco, não substitui o processo do banco externo.

## Fase 2 — provisionador por sessão

1. Criar contrato autenticado de provisionamento usando identidade da instância e nome exato da sessão; validar a chamada e a propriedade do alvo. Restringir a origem e impedir que nomes arbitrários façam alterações em sessões de outros sistemas.
2. Aceitar explicitamente sessão existente `STOPPED` sem proxy. Fazer GET completo, reservar, aplicar **merge** de `config.proxy`, confirmar com novo GET e retornar resultado sem credenciais. Com sessão parada, não chamar restart ou start. A confirmação de configuração não prova tráfego real.
3. Se a sessão já tiver proxy, preservar sua configuração e reconciliar com a reserva correspondente; divergência vai para revisão/quarentena, sem substituir IP automaticamente. Não tratar `config.proxy.server` presente como prova de atribuição correta no pool.
4. Retornar resultados distinguíveis: `confirmado`, `pool_esgotado`, `conflito`, `incerto`, `indisponivel`. Estabelecer timeout e idempotência entre app e workflow; execução retomada após queda deve retomar pela identidade/operação, não escolher um proxy novo.
5. Não guardar ou emitir credenciais em logs, respostas, fixtures ou dados de execução n8n. Revisar retenção dos payloads dos nós; limitar acesso às credenciais e ao pool. A escrita de configuração deve preservar webhooks, filtros, acervo e campos desconhecidos.

## Fase 3 — integração do CRM

1. Disponibilizar modo de pool gerenciado opt-in para a instalação Axis, sem alterar o padrão self-host. `WAHA_SESSION_PROXY` permanece compatível no modo legado; modos simultâneos devem ser recusados explicitamente no modo pool, e não combinados silenciosamente.
2. Em `connectWahaChannel`, após `createSession(... start=false)` e antes de `startExistingSession`, chamar o provisionador com a identidade do canal já reservada. Confirmar a configuração no WAHA e, no modo obrigatório, só iniciar quando o proxy estiver confirmado. Integrar com lease, `remote_created`, replay idempotente e recuperação existentes; não apagar a sessão remota em falha.
3. Cobrir reconexão manual, retomada pelo reconciliador, `restart` e inicialização automática de sessões. Uma sessão previamente pareada com proxy válido conserva o mesmo IP; ausência ou divergência não justifica sobrescrever nem reiniciar sem política. O controle pré-start do CRM sozinho não prova que um restart autônomo do WAHA ou outro criador não conectará sem proxy.
4. Registrar estado recuperável sem inventar valores incompatíveis com `channelSchema` ou o banco: `FAILED` com `status_reason` e aviso, ou alteração de schema com migration/baseline se comprovadamente necessária. Mostrar em Conexões uma mensagem de próximo passo, sem endereço, usuário ou senha; auditar transições com `requestId` e escopo por organização.

## Fase 4 — watchdog e rotação

1. Transformar `SEDI` em reconciliação idempotente, com consulta completa por instância, autenticação, limites de tentativas, espera entre tentativas e sinalização de erro. O watchdog não deve competir com uma reserva ou PUT em andamento.
2. Suspender o ramo automático de liberação no desenho novo até haver confirmação de escopo e ausência; não liberar por resposta vazia, falha de rede, sessão parada, `FAILED` ou por uma única observação. Validar formato da resposta e paginação antes de confiar na lista.
3. Revisar o workflow de rotação e qualquer outro escritor para usar as mesmas travas/estados. Mudanças de IP em sessões pareadas exigem política operacional e prova de recuperação; não acoplar rotação semanal a essa entrega sem revisão.
4. Registrar o que aconteceu, falhas e próximo retry em local operacional visível. Falta de pool ou proxy indisponível deve ter aviso com ação clara, sem registrar dados pessoais ou credenciais.

## Fase 5 — testes e implantação controlada

1. Unitários/integração: criação parada → reserva → PUT → GET → start; pool vazio; recusa do serviço; retries; replay; nomes indevidos; preservação de configuração; modo legado e opt-in. Cobrir reconexão e caminhos de início fora do CRM.
2. Banco efêmero: concorrência entre duas sessões, duplicidade da mesma sessão, constraints e transações; falhas em cada fronteira entre reserva, PUT, GET e confirmação; timeout com PUT efetivamente aplicado; lease expirado; recuperação após reinício. Validar que proxy incerto nunca volta prematuramente ao pool.
3. WAHA/n8n isolados com pool sintético: validar o contrato real de `STOPPED`, sem iniciar por PUT, e os diferentes estados; simular watchdog simultâneo, listas vazias/incompletas, sessão excluída e sessão `FAILED`. Testar rotação e outros consumidores se compartilharem o pool.
4. Jornada visual em staging isolado: criar canal, observar QR, parear conta de teste e verificar config por sessão, atribuição e preservação de webhook; testar erro do pool. Quando possível, verificar também o IP efetivo de saída da sessão por instrumento apropriado, sem assumir que `WORKING` ou `config.proxy` prova roteamento.
5. Após revisão do diff e dos testes, preparar backup e rollback do workflow e do app, com janela de operação. Reconciliar o inventário de produção por proposta aprovada, implantar gradualmente e validar uma sessão de teste autorizada. Sem mudança de sessão de cliente para testar. Rollback do app não deve libertar reservas já aplicadas nem retirar proxies existentes.

## Aceite obrigatório

- **AC-01:** com pool gerenciado e proxy disponível, sessão nova parte de `STOPPED`, recebe proxy do pool e só chama `start` após GET confirmar a configuração; ver teste de integração e jornada visual isolada.
- **AC-02:** duas sessões novas concorrentes recebem reservas diferentes; repetição da mesma operação mantém a mesma reserva; ver teste real em Postgres efêmero.
- **AC-03:** pool esgotado, erro ou resultado desconhecido não iniciam nova sessão no modo obrigatório; erro é visível e recuperável. O modo self-host sem pool continua funcionando como antes.
- **AC-04:** timeout após PUT aplicado, falha após reserva e reinício do executor convergem sem liberar IP em uso nem reservar outro; testar cada ponto de falha.
- **AC-05:** webhooks, ignore, grupos, acervo e campos adicionais sobrevivem ao PUT; segredos não aparecem em respostas, logs e dados de execução acessíveis ao operador.
- **AC-06:** watchdog/rotação não liberam proxy de sessão existente, inclusive `STOPPED`/`FAILED`, não tratam lista vazia/incompleta como ausência e não alteram sessão não pertencente ao escopo.
- **AC-07:** inventário do pool e sessões está reconciliado antes da liberação de novos leases em produção; duplicidade e divergência têm decisão explícita, sem trocar IP automaticamente.
- **AC-08:** todo proxy já configurado em sessão ativa, com correspondência e propriedade inequívocas no pool, fica registrado como `atribuido` à sessão existente; validação compara WAHA e pool antes e depois, sem reiniciar sessão. Conflitos permanecem bloqueados para reutilização e são relatados.

## Ordem de entrega e estimativa

1. Inventário e contrato: 2–4 horas, dependendo do acesso aos consumidores do pool.
2. Reserva transacional, provisionador e testes de falha: 1–2 dias de engenharia.
3. Integração do CRM, watchdog e prova em staging: 1–2 dias de engenharia.
4. Reconciliação e implantação: janela definida com operação; a duração depende dos conflitos e do acesso a um número de teste.

As estimativas são de execução, não prazos garantidos. Nenhuma alteração foi aplicada em produção por este plano.
