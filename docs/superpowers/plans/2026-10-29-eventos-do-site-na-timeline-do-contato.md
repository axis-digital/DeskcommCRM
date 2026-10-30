# Eventos do site na linha do tempo do contato — Plano

> **Status (2026-10-29):** etapa 0 (pedidos) **pronta no código, sem commit**; etapas 1 a 3 **NÃO INICIADAS**. **A etapa 1, a 1b e a tabela `site_events` foram aprovadas pelo dono em 2026-10-29**; falta a autorização para commitar o que está pronto e empilhar a etapa 1. Nada foi publicado. **Revisado após verificar a integração GA4 que já existe** (seção abaixo): as etapas 1b, 2 e 3 mudaram. **Acrescentada a seção "Identidade do visitante"** (sessão, vínculo e retroação), que é o que permite atribuir a navegação anônima a um cadastro.

**Goal:** tudo o que a pessoa faz na loja virtual (cadastrou-se, pôs no carrinho, iniciou o checkout, abandonou o carrinho, pediu) aparece na linha do tempo da ficha do contato, ligado ao contato certo e **uma vez só**, mesmo que a Nuvemshop e o GA4 vejam o mesmo fato.

**Regras do dono:** PR só no fork (`-R axis-digital/DeskcommCRM`), base `main`; atualizar o fork com a upstream antes de criar branch; produção só com autorização explícita.

## A integração GA4 que já existe (verificada em 2026-10-29)

Vem das migrations 9002 a 9004 do fork (conversões GA4, PRs #2 e #3 já mesclados). **O sentido é o oposto do que este plano supôs: o CRM ENVIA conversões ao GA4**, não lê eventos dele.

- **Envio:** `lib/plataformas-de-anuncio/ga4/measurement-protocol.ts` manda ao `/mp/collect` o evento da venda e os de etapa do funil (`lib/conversoes/mapa-de-eventos-ga4.ts`). Só envia se capturou o `client_id` do visitante; evento mais velho que 72 h é recusado antes da rede. Na compra, o `transaction_id` enviado é o **id do lead**.
- **Identidade:** `ga_client_id` e `ga_session_id` moram em `contacts.source_metadata` (`lib/plataformas-de-anuncio/ga4/identidade.ts`). Chegam pelo marcador `[dk1:…]` na primeira mensagem do WhatsApp, gerado por um script de landing page (`app/app/settings/conversoes/_scriptDoSite.tsx`, `lib/leads/origem-do-site.ts`). Esse caminho serve a landing page com link `wa.me`, não a loja.
- **Leitura:** o pipeline do servidor (`dlt-extractor`, `pipelines/ga4.py`) lê o GA4 só em **agregado** (data × evento, canal, cidade). Nada por pessoa. Saudável: dados até 28/10 e batendo com a consulta direta.

**No caso da loja piloto (medido no banco):**
- A organização **não tem nenhuma conexão de plataforma** (`ad_platform_connections` vazia): o envio ao GA4 está desligado.
- **0 de 3.067 contatos** têm `ga_client_id`. A ponte contato↔visitante existe no código e não existe nos dados.
- 127 de 241 pedidos trazem `landing_url` no payload, com `fbclid` (38), `utm_source` (33) e `utm_campaign` (31); nenhum `gclid` nem cookie do GA. Hoje a `landing_url` é gravada e **ninguém a lê** (evento sem consumer).
- O `transaction_id` do `purchase` no GA4 é o **número do pedido da loja** (os 8 maiores lidos: 395 a 403), o mesmo que o payload guarda em `payload->>'number'`.

## Como obter o `client_id` (verificado em 2026-10-29)

**Nada precisa ser ativado no GA4 para o caminho do navegador.** Medido na loja piloto com um navegador de verdade:

- A loja usa a **integração nativa da Nuvemshop** com o GA4: `ga4_measurement_id` no objeto `LS.store`, tag `gtag.js` carregada com uma camada de dados própria (`dataLayerTN`), consentimento padrão `granted` e *linker* entre o domínio da loja e `nuvem.com.br` (o `client_id` atravessa os dois). O fluxo web da propriedade (Admin API) confirma o mesmo ID de medição.
- O cookie `_ga` nasce, é legível por JavaScript (`httpOnly: false`) e vem no formato `GA1.1.<n>.<n>`, que o leitor existente (`public/rastreio/v1.js`) já entende. O `_ga_<ID>` traz a sessão no formato `GS2.1.s<n>$…`, também já tratado.
- A coleta que o site manda ao GA4 já leva `cid` (client_id) e `sid` (sessão), e **não** leva `uid` (não há `user_id`).

**Caminhos, do mais simples ao mais pesado:**
1. **Ler o cookie no navegador** (recomendado): script na vitrine lê `_ga` e `_ga_<ID>` e envia ao CRM junto do cliente logado (`LS.customer`). Reaproveita o leitor que já existe. Sem mudança no GA4.
2. **Exportação para o BigQuery:** a propriedade **não tem** vínculo hoje (Admin API devolveu a lista vazia). Para ligar: GA4 › Administrador › Vínculos de produtos › BigQuery, com papel de Editor na propriedade e um projeto do Google Cloud com faturamento. Na propriedade padrão a exportação diária tem teto de 1 milhão de eventos por dia (a loja piloto está bem abaixo: cerca de 190 mil eventos em 30 dias). No export, `user_pseudo_id` é o `client_id`. Serve para cruzar histórico, não para tempo real.
3. **Dimensão personalizada com o `client_id`:** exige mudar a tag (a integração nativa da Nuvemshop não aceita parâmetros extras), tem teto de cardinalidade e a API de relatórios agrupa o excesso em "(other)". Não recomendado.
- **Não funciona:** a API de relatórios do GA4 rejeita `userPseudoId` (erro 400), e o Measurement Protocol só envia, não lê.

**Atenção de LGPD:** o consentimento da loja é `granted` por padrão, sem banner de consentimento identificado na página. Ligar o `client_id` a uma pessoa identificável é decisão de base legal, não só técnica.

## O que foi medido (2026-10-29, loja piloto, últimos 30 dias)

- **O que a integração assina hoje:** `order/created`, `order/updated`, `order/paid`, `order/cancelled`, `product/*` e `app/uninstalled`. Nenhum evento de cliente nem de checkout.
- **GA4 (por eventos):** `add_to_cart` 499 (246 pessoas), `begin_checkout` 93 (56), `add_shipping_info` 48, `add_payment_info` 30, `purchase` 28 (26), `form_submit` 652. Não há `sign_up` nem `login`.
- **GA4 não identifica a pessoa:** a propriedade não tem dimensão personalizada, e nenhum evento leva `user_id`, e-mail ou id de cliente. A API de relatórios devolve só agregados. **Não medido:** se existe exportação para o BigQuery.
- **Pedidos:** 29 na Nuvemshop (25 sem cancelados) contra 28 `purchase` no GA4. Batem quase 1 para 1, então a deduplicação de pedidos é viável.
- **Nuvemshop, pela documentação oficial:** existe webhook `customer/created|updated|deleted`; existe API de checkouts abandonados (consultável por 30 dias, apagada em 90); o script da vitrine lê `LS.customer` (id do cliente logado) e `LS.cart`.
- **Não confirmado:** se há webhook de carrinho abandonado (não achei; tratar como consulta por API no cron). Se o modo `onfirstinteraction` do script é suficiente para capturar `add_to_cart`.
- **O que bloqueia o desenho:** `crm_lead_activities.lead_id` é `NOT NULL`. Contato que só comprou não tem negócio, então a atividade não tem onde ser gravada. Por isso a etapa 0 **projeta** `orders` em tempo de leitura.

## Identidade do visitante: sessão, vínculo e retroação

**Objetivo:** registrar o que um visitante faz **antes** de se identificar e, quando ele se cadastrar, atribuir esse histórico ao registro dele. O plano anterior só tinha eventos; faltavam estas três peças.

**1. Sessão como registro próprio** (`site_sessions`)
- Uma linha por `(organization_id, ga_client_id, ga_session_id)`: horário de início, página de entrada, referrer e as chaves de origem (`utm_*`, `fbclid`, `gclid`) pela lista fechada `CHAVES_DE_UTM` que já existe.
- É a sessão que diz "de onde veio" antes do cadastro. O GA4 só entrega isso em agregado; por pessoa só o script entrega.
- `contact_id` nulo enquanto anônima.

**2. Vínculo `client_id` ↔ contato, por intervalo** (`site_identity_links`)
- Uma linha por vínculo: `organization_id`, `ga_client_id`, `contact_id`, a origem (`logado_na_vitrine`, `checkout`, `formulario`, `whatsapp_dk1`), `valido_de`, `valido_ate` (nulo = vigente), `visto_primeira_vez`, `visto_ultima_vez`, `classe_do_aparelho` (celular ou computador) e `navegador`. Índice único parcial: **um vínculo vigente por `(organization_id, ga_client_id)`**.
- **Decidido pelo dono em 2026-10-29 (refinamento por intervalo):** um evento pertence ao contato cujo vínculo estava vigente **no momento do evento**. Ao vincular o mesmo `client_id` a outro contato, o vínculo vigente é encerrado (`valido_ate = agora`) e abre-se um novo. Os eventos antigos **não migram** para a segunda pessoa; só os novos vão. Isto substitui a ideia anterior de "último contato vence" puro e dispensa a tabela de histórico: o intervalo já é o histórico, e desfazer um vínculo errado é fechar ou apagar uma linha.
- A timeline **resolve na leitura** pelo vínculo: não se reescrevem linhas de evento ao vincular.

**Caso A: uma pessoa, vários aparelhos.** Cada aparelho tem o seu `client_id`, e a mesma pessoa é reconhecida pelo contato (e-mail, telefone ou CPF, como `contato-do-pedido.ts` já faz). Resultado: **uma linha de vínculo por aparelho, todas no mesmo contato**; não há troca de dono. A ficha mostra os eventos juntos e rotula cada aparelho por ordem de aparecimento: "Dispositivo 1 · celular · Chrome", "Dispositivo 2 · computador · Safari". O rótulo é calculado na leitura; só a classe do aparelho e o navegador são guardados (o texto completo do navegador **não** é guardado: identifica demais).

**Caso B: um aparelho, várias pessoas (aparelho compartilhado).** Vale o intervalo acima. O histórico anônimo anterior ao primeiro vínculo vai para o primeiro contato que se identificar. Imprecisão que sobra e é aceita: eventos entre a última prova de identidade da primeira pessoa e a identificação da segunda continuam com a primeira, porque não há como saber quando o aparelho trocou de mãos.

**Alinhamento com a integração GA4 existente:** o CRM guarda hoje um único `ga_client_id` por contato (em `source_metadata`) e o envio de conversões o usa. Com vários aparelhos, o envio deve usar o vínculo do aparelho da **sessão que converteu**, não "o do contato". Fusão de contatos duplicados (`juntar contatos`) precisa mover os vínculos junto.

**3. Regra de retroação e de descarte**
- Ao criar o primeiro vínculo de um `client_id`, as sessões e os eventos anteriores dele passam a aparecer na timeline do contato. Num vínculo seguinte (outra pessoa no mesmo aparelho), só entram os eventos a partir de `valido_de`.
- A origem da sessão **mais antiga** vira o primeiro toque do contato **se ele ainda não tiver um**, pela regra que já existe (`fn_estampar_atribuicao_de_anuncio`, que nunca sobrescreve o primeiro toque).
- Sessão e evento anônimos que nunca se identificam são apagados após **90 dias** (decidido).
- Anonimização LGPD de um contato apaga os vínculos dele; contato anonimizado não recebe retroação.

**Quando o vínculo nasce (o ponto frágil):** só quando o script roda numa tela em que a pessoa já está identificada.

| Situação | O vínculo nasce? | Estado |
|---|---|---|
| Cliente logado na vitrine (`LS.customer` preenchido) | sim, na página seguinte ao cadastro | **não testado** com cadastro real |
| Checkout (identifica por e-mail) | só com o script de checkout no NubeSDK | **não iniciado**; prazo da Nuvemshop: 30/10/2026 |
| Webhook `customer/created` | não, traz e-mail mas não o `client_id` | por si só não cruza |
| Formulário ou clique para o WhatsApp (marcador `[dk1:…]`) | sim, caminho que já existe | em produção para landing page |
| Compra sem login e sem checkout instrumentado | não | fica anônimo |

**Pré-requisitos antes de gravar visitante anônimo (LGPD):** base legal definida; aviso na política de privacidade da loja; o consentimento da loja hoje é `granted` por padrão, sem banner identificado. Sem isso, a etapa 2 grava só o evento de quem já está identificado (cliente logado) e descarta o anônimo.

**Medido (2026-10-29, loja piloto):** a API de clientes da Nuvemshop devolve 1.543 clientes, dos quais **195 têm conta ativa** (13%). Cruzando com os pedidos já sincronizados:

| Compradores | Total | Com conta (login possível) |
|---|---|---|
| Todos | 190 | 51 (27%) |
| Dos últimos 90 dias | 46 | 7 (**15%**) |
| Recorrentes (2 ou mais pedidos) | 30 | 8 (27%) |
| Pedidos | 240 | 63 (26%) |

**Conclusão:** o vínculo por login cobre só uma minoria dos compradores (15% no último trimestre). O momento em que quase todos se identificam é o **checkout / página de agradecimento**, onde a vitrine expõe `LS.order` (id, número, total). Portanto o vínculo de quem compra sem conta depende de um script de checkout no NubeSDK (que lê o `_ga` e o número do pedido) ou da exportação do BigQuery (que liga o `client_id` ao `transaction_id` do `purchase`, mas **só a partir do dia em que for ligada, sem histórico**). Os dois valem daqui para frente; nenhum recupera compras passadas.

**Ainda por testar:** se o cadastro pela vitrine mantém o `client_id` na página seguinte; quem controla o registro do script NubeSDK no Portal de Parceiros da Nuvemshop (o script de checkout é criado lá, não por API).

## Etapa 0 — Pedidos na timeline (PRONTA, não commitada)

Projeção de `orders` em `GET /api/v1/contacts/[id]/timeline`; módulo puro `lib/nuvemshop/pedido-na-timeline.ts`; tipo `TimelineItemDoContato`. Sem schema, retroativa. Testes: módulo, rota e tela; spec e2e `nuvemshop-sincroniza-pedidos` estendida (roda só no CI). Branch `feat/pedidos-na-timeline-do-contato`, empilhada sobre o merge da upstream (`merge/upstream-2026-10-29`).

## Etapa 1 — Cadastro e carrinho abandonado, pela API da Nuvemshop

Única etapa que não depende de aprovação externa nem de script no site. **Correção do que foi dito antes:** ela já precisa de uma tabela nova (volume baixo), porque o carrinho abandonado só fica 30 dias na API da Nuvemshop e precisa ser guardado.

- [ ] **Decidir a tabela** (`site_events`: `organization_id`, `contact_id` nulo, `kind`, `occurred_at`, `source`, `dedupe_key`, `payload` mínimo, **`ga_client_id` e `ga_session_id` nulos já previstos** para a etapa 2 não exigir forward-fix; único por `(organization_id, dedupe_key)`; RLS `tenant_isolation_*`). As tabelas `site_sessions` e `site_identity_links` nascem na etapa 2, em migration própria. Migration na faixa 9000+ (conferir o número livre com `pnpm checar:colisao-de-migration`), apêndice idempotente no baseline, `-- manifest:`, grants explícitos revogando `anon`.
- [ ] Assinar `customer/created` (e `updated`) no registro de webhooks; handler novo no modelo de `pedido.handler.ts`, passando pelo `event_log`.
- [ ] Consulta de checkouts abandonados no cron `nuvemshop-reconcile`, gravando o evento (idempotente pela `dedupe_key`).
- [ ] Ligar ao contato por e-mail ou id de cliente da loja (reaproveitar `contato-do-pedido.ts`; contato anonimizado não volta).
- [ ] Timeline do contato soma `site_events` à projeção de pedidos (mesma rota, mesmo cursor).
- [ ] Tradução (es/en), fragmento `.changes/`, mapa `nuvemshop-sync.architecture.json`, jornada J58.
- [ ] Teste de isolamento entre duas organizações (obrigatório para tabela nova) e `pnpm test:db`.

## Etapa 1b — Origem do pedido a partir da `landing_url` (NOVA, barata)

- [ ] Usar a `landing_url` que o sync já grava para carimbar a origem do contato (UTMs e `fbclid`) pela regra que já existe (`CHAVES_DE_UTM`, `fn_estampar_atribuicao_de_anuncio`, que preserva o primeiro toque). Hoje o dado é gravado e descartado.
- [ ] Sem schema novo; retroativa para os pedidos já sincronizados. Reaproveita o consumidor existente em vez de criar regra paralela.

## Etapa 2 — Carrinho e checkout, por script na vitrine

- [ ] Script `onfirstinteraction` (não exige aprovação) que envia ao CRM `add_to_cart`, `begin_checkout` e afins com o id do cliente logado (`LS.customer`).
- [ ] **Reaproveitar a captura que já existe:** o mesmo script lê o cookie `_ga` e o `_ga_<ID>` e grava `ga_client_id` e `ga_session_id` em `source_metadata` do contato, no formato que `identidade.ts` já lê. Isso liga o visitante do GA4 ao contato sem inventar identidade nova.
- [ ] **Risco de contagem em dobro, a tratar antes de ligar o envio de venda:** a loja já manda `purchase` ao GA4 pelo próprio site, com o número do pedido como `transaction_id`. O envio do CRM usa o id do lead. O GA4 só deduplica `purchase` quando o `transaction_id` é igual, então ligar o envio de venda numa loja assim contaria a compra duas vezes. Antes de ativar: enviar o número do pedido como `transaction_id` quando houver pedido da loja, ou deixar a venda de fora para esse tipo de loja. **Não testado.**
- [ ] Receptor autenticado por loja (nunca confiar em `organization_id` do corpo; resolver pela loja registrada), com limite de taxa.
- [ ] Tabelas `site_sessions` e `site_identity_links` (ver a seção "Identidade do visitante"): migration na faixa 9000+, apêndice no baseline, RLS, grants explícitos, teste de isolamento entre duas organizações.
- [ ] Gravar o vínculo quando o script vê `LS.customer` (cliente logado) junto do `_ga`; origem do vínculo gravada. Vínculo por intervalo: o anterior é encerrado e um novo é aberto; a classe do aparelho e o navegador são gravados, não o texto completo do navegador.
- [ ] Retroação na timeline: a rota soma `site_sessions` e `site_events` pelos `client_id` vinculados ao contato, com o mesmo cursor da etapa 0.
- [ ] Rotina de descarte do anônimo vencido (cron, só audita quando apaga algo) e limpeza dos vínculos na anonimização LGPD.
- [ ] Anônimo: **só depois da decisão do dono e do pré-requisito de LGPD.** Antes disso o script grava apenas evento de quem já está identificado.
- [ ] Checkout: scripts de checkout migram para o NubeSDK com prazo em 30/10/2026; a etapa deve nascer já no NubeSDK ou ficar só na vitrine.
- [ ] Gravar só eventos de intenção (carrinho, checkout, cadastro, pedido, abandono); ignorar `page_view` e `view_item` (dezenas de milhares por mês).

## Etapa 3 — GA4 como confirmação, não como fonte

- [ ] `dedupe_key` única por fato. **Verificado:** para pedido, a chave é o número da loja (igual ao `transaction_id` do GA4). Para carrinho e checkout não há id comum medido; usar o id do carrinho da Nuvemshop quando existir, e `ga_session_id` + tipo de evento como reserva.
- [ ] O GA4 tem o `client_id`, mas a API de relatórios não o expõe; só a exportação para o BigQuery o entrega por evento. Sem essa exportação, o GA4 serve para atribuição de origem e para conferir contagem, **não** como fonte de eventos por pessoa. Com `ga_client_id` já gravado no contato (etapa 2), a exportação passaria a permitir o cruzamento. **Não medido:** se a exportação existe.
- [ ] Medir antes: exportação BigQuery da propriedade, e se o GTM Server-Side pode repassar o evento ao CRM (hoje não há container para a loja piloto).

## Decisões pendentes do dono

**Decididas pelo dono em 2026-10-29:**
1. Etapa 1, etapa 1b e tabela `site_events`: **aprovadas**.
2. Visitante anônimo: **guardar, por 90 dias**, depois apagar se nunca se identificou. O requisito de LGPD continua valendo antes de ligar em produção (base legal e aviso na política de privacidade da loja); o prazo está decidido, o aviso é da loja.
3. Vínculo de aparelho compartilhado: **por intervalo** (refinamento decidido em 2026-10-29 sobre o "último contato vence"). O evento fica com o contato cujo vínculo estava vigente no momento; o vínculo anterior é encerrado, não apagado, e os eventos antigos não migram para a segunda pessoa. Uma pessoa com vários aparelhos tem um vínculo por aparelho, todos no mesmo contato, rotulados "Dispositivo 1", "Dispositivo 2".
4. Medir quantos compradores têm conta: **feito** (resultado acima).

**Ainda pendentes:**
5. **Checkout via NubeSDK** (agora é o ponto central: sem ele o vínculo cobre só cerca de 15% dos compradores recentes). Exige o script criado no Portal de Parceiros da Nuvemshop e a decisão de quem faz isso.
6. Volume: seguir com a proposta de gravar só eventos de intenção (carrinho, checkout, cadastro, pedido, abandono), salvo ordem contrária.
7. Ligar a exportação do BigQuery? A recomendação anterior ("não agora") ficou mais fraca: o BigQuery liga o `client_id` ao pedido de **todos** os compradores a partir do dia em que for ligado, sem depender de login nem de NubeSDK. Sem histórico.

**Destino (DoD 18):** núcleo, seguindo a integração Nuvemshop que já vive no núcleo do fork; a pergunta "se nenhuma organização ativar isto, a operação comum continua inteira?" responde que sim, então reavaliar como extensão antes de abrir o PR da etapa 2. **Fragmento `.changes/`:** `capacidade_nova`, voz do operador.
