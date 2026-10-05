# Mapa de integrações e configurações

> **Para quem é:** quem instala, configura ou monta uma operação no CRM.
>
> **Fonte operacional:** `.env.example`, `lib/env.ts`, as telas e os adapters citados
> em cada linha. Variável vazia normalmente significa “recurso desligado” ou “usar o
> valor padrão”; não significa que a integração esteja configurada.

## Como ler a matriz

| Status | Significado |
|---|---|
| **Pronto** | Há fluxo de produto e código de integração no repositório. |
| **Opcional** | O recurso existe, mas fica desligado ou indisponível sem configuração. |
| **Fallback** | A variável serve como piso da instalação; o banco ou a tela pode prevalecer. |
| **Infraestrutura** | É configuração do self-host, worker, segurança ou operação, não uma integração comercial. |

## Integrações de aquisição, atendimento e receita

| Serviço / oportunidade | Variáveis principais | Tela ou fluxo | Dependências | Status |
|---|---|---|---|---|
| **Google Ads + conversões offline** | `GOOGLE_ADS_OAUTH_CLIENT_ID`, `GOOGLE_ADS_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `NEXT_PUBLIC_APP_URL` | Configurações → Conversões; OAuth em `/api/v1/plataformas-de-anuncio/google/*` | Projeto Google Cloud, OAuth, conta Google Ads e ação de conversão | **Pronto; Data Manager recomendado** |
| **Meta WhatsApp Cloud API** | `META_APP_ID`, `META_APP_SECRET`, `META_WABA_ID`, `META_PHONE_NUMBER_ID`, `META_SYSTEM_USER_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `META_WEBHOOK_BASE_URL`, `META_GRAPH_VERSION` | Admin → API Oficial (Meta); Conexões | App Meta, WABA, número e webhook público HTTPS | **Pronto / opcional** |
| **Meta Ads e Conversions API** | `META_APP_SECRET`, `META_ADS_GRAPH_BASE_URL`, `META_GRAPH_VERSION` | Configurações → Conversões; Anúncios → Meta | Credencial e identidade de conversão da organização | **Pronto / opcional** |
| **WAHA WhatsApp** | `WAHA_API_BASE_URL`, `WAHA_API_KEY`, `WAHA_HMAC_SECRET`, `WAHA_WEBHOOK_BASE_URL`, `WAHA_WEBHOOK_REQUIRE_SIGNATURE`, `WAHA_SESSION_PROXY`, `WAHA_HISTORY_IMPORT_DAYS` | Conexões → WhatsApp | Container WAHA, volume persistente e webhook público | **Pronto / principal** |
| **Google Calendar** | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` | Agenda → Conectar Google | OAuth Web Application e callback `/api/v1/agenda/google/callback` | **Pronto / opcional** |
| **Nuvemshop** | `NUVEMSHOP_ENABLED`, `NUVEMSHOP_APP_ID`, `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET`, `NUVEMSHOP_OAUTH_ENCRYPTION_KEY` | Integrações → Nuvemshop | App de parceiro, OAuth e webhooks HTTPS | **Pronto / opcional** |
| **Captação por webhook** | `NEXT_PUBLIC_APP_URL`, `INTERNAL_SECRET` e segredos cadastrados na tela | Webhooks → Fontes e regras | Sistema externo que envia o lead; assinatura e idempotência | **Pronto** |
| **Zernio** | `ZERNIO_ACCOUNT_ID`, `ZERNIO_API_KEY`, `ZERNIO_API_BASE_URL` | Conexões → redes/canais | Conta no provedor e sessão da organização | **Opcional** |
| **Datafy** | `DATAFY_ENABLED=true`, `DATAFY_API_BASE_URL` | Conexões; credenciais ficam por organização | Contrato/provedor homologado e webhook assinado | **Opcional / desligado por padrão** |

## Nuvemshop: configuração correta por tenant

Há dois administradores diferentes neste fluxo:

- **Portal de Parceiros da Nuvemshop:** cadastra o aplicativo uma vez por instalação.
- **Admin do Deskcomm:** cada organização autoriza a sua própria loja pelo OAuth.

O Portal de Parceiros não deve receber uma credencial diferente para cada tenant.
Ele fornece um único `app_id`, `client_id` e `client_secret`; a loja autorizada e o
token ficam separados por organização em `tenant_integrations`.

### 1. Configuração única no Portal de Parceiros Nuvemshop

Crie um aplicativo externo no portal de parceiros e configure:

| Campo do portal | Valor |
|---|---|
| App ID / Client ID | Valor copiado para `NUVEMSHOP_APP_ID` e `NUVEMSHOP_CLIENT_ID` |
| Client Secret | Valor copiado para `NUVEMSHOP_CLIENT_SECRET` |
| Redirect/Callback URL | `<NEXT_PUBLIC_APP_URL>/api/v1/integrations/nuvemshop/callback` |
| Admin/App URL | `<NEXT_PUBLIC_APP_URL>/app/integrations/nuvemshop` |
| Preferences URL | `<NEXT_PUBLIC_APP_URL>/app/integrations/nuvemshop` |
| Privacy Policy URL | URL pública da política de privacidade da instalação |
| Support URL / e-mail | Canal de suporte do operador da instalação |
| Store Redact webhook | `<NEXT_PUBLIC_APP_URL>/api/v1/webhooks/nuvemshop/store-redact` |
| Customer Redact webhook | `<NEXT_PUBLIC_APP_URL>/api/v1/webhooks/nuvemshop/customer-redact` |
| Customer Data Request webhook | `<NEXT_PUBLIC_APP_URL>/api/v1/webhooks/nuvemshop/customer-data-request` |

Use HTTPS público em produção. A Nuvemshop não entrega webhooks para `localhost`.
O callback precisa coincidir exatamente com `NEXT_PUBLIC_APP_URL`, incluindo
protocolo, domínio, porta e caminho.

Os três webhooks LGPD são cadastrados no Portal de Parceiros porque são URLs
obrigatórias da aplicação. Já os webhooks operacionais de pedidos e produtos são
criados automaticamente pelo callback do Deskcomm depois que cada loja autoriza o
aplicativo; não os cadastre manualmente para evitar assinaturas duplicadas.

### 2. Configuração da instalação do Deskcomm

No `.env` da VPS, configure:

```dotenv
NUVEMSHOP_ENABLED=true
NUVEMSHOP_APP_ID=<app_id_do_portal>
NUVEMSHOP_CLIENT_ID=<client_id_do_portal>
NUVEMSHOP_CLIENT_SECRET=<client_secret_do_portal>
NUVEMSHOP_OAUTH_ENCRYPTION_KEY=<chave_gerada_pelo_kit>
NEXT_PUBLIC_APP_URL=https://crm.exemplo.com
INTERNAL_SECRET=<segredo_interno>
```

Depois reinicie o app. A chave `NUVEMSHOP_OAUTH_ENCRYPTION_KEY` é provisionada
no banco pelo kit como `private.app_secrets.nuvemshop_oauth_key`; ela é usada pelas
RPCs `fn_encrypt_oauth`/`fn_decrypt_oauth` para cifrar tokens e segredos. Não deve
ser colocada no navegador nem compartilhada com o tenant.

### 3. Autorização de cada tenant

Para cada organização:

1. Entre no tenant correto no Deskcomm.
2. Abra **Integrações → Nuvemshop**.
3. Um usuário com papel `admin` clica em **Conectar com Nuvemshop**.
4. Autorize o aplicativo na loja desejada.
5. Confirme o retorno para `/app/integrations/nuvemshop?ok=1`.
6. Confira o número da loja, escopos e webhooks registrados na tela.

O `state` OAuth carrega a organização e a sessão do administrador. No callback,
o `user_id` retornado pela Nuvemshop vira o `store_id` daquela integração. Repetir
esse processo em outro tenant cria outra conexão independente; repetir no mesmo
tenant reconecta/substitui a única conexão daquele tenant.

### 4. Checklist de aceite por tenant

- [ ] O Portal de Parceiros tem o callback exato do ambiente.
- [ ] Os três URLs LGPD estão públicos e apontam para os caminhos acima.
- [ ] A VPS tem as cinco variáveis Nuvemshop/URL configuradas.
- [ ] O admin autorizou a loja correta, não apenas o app no portal.
- [ ] A tela mostra `healthy`, `store_id` e os webhooks registrados.
- [ ] Um webhook real chega com `x-linkedstore-hmac-sha256` e passa na validação.
- [ ] O evento aparece em `webhook_events_log` com a organização correta.

### Limitação atual

O modelo atual permite **uma loja por organização**. A instalação pode ter várias
organizações, cada uma com uma loja, mas o mesmo tenant não pode manter duas lojas
Nuvemshop simultaneamente.

### Google Ads: configuração recomendada

O fluxo já captura `gclid`, `gbraid` e `wbraid`, associa o clique ao lead e pode
reportar qualificação, venda e valor da venda. O `refresh_token`, `customer_id` e
as ações de conversão da organização são gravados no banco; as três variáveis OAuth
acima identificam a aplicação da instalação.

Há dois transportes no código:

- **Data Manager API:** caminho recomendado para novas instalações e conexões.
- **Google Ads API `uploadClickConversions`:** compatibilidade legada.

O Google informa que `UploadClickConversions` passou a ter restrições para novos
projetos a partir de 15/06/2026 e recomenda Data Manager para conversões offline e
Enhanced Conversions for Leads. O código já possui o adapter Data Manager; uma
instalação nova deve escolher esse caminho quando a tela oferecer a opção.

Referências oficiais: [conversões offline do Google Ads](https://developers.google.com/google-ads/api/docs/conversions/upload-offline),
[Data Manager API](https://developers.google.com/data-manager/api) e
[categorias de conversão](https://developers.google.com/google-ads/api/docs/conversions/categories).

## IA, mídia e automação

| Serviço / oportunidade | Variáveis principais | Uso combinado | Status |
|---|---|---|---|
| **Vercel AI Gateway** | `AI_GATEWAY_API_KEY`, `AI_GATEWAY_BASE_URL`, `VERCEL_AI_GATEWAY_URL` | Chat, agente, fallback e observabilidade | **Pronto / preferencial** |
| **Anthropic** | `ANTHROPIC_API_KEY` | Modelo de chat/agente como fallback de plataforma | **Pronto / opcional** |
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_REASONING_EFFORT` | Embeddings, transcrição, visão e modelos | **Pronto / opcional** |
| **OpenRouter** | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_APP_URL`, `OPENROUTER_APP_TITLE` | Catálogo de modelos, chat e embeddings como alternativa | **Pronto / opcional** |
| **Transcrição compatível com OpenAI** | `TRANSCRIPTION_API_KEY`, `TRANSCRIPTION_BASE_URL`, `TRANSCRIPTION_MODEL`, `TRANSCRIPTION_LANGUAGES` | Áudio recebido no WhatsApp → texto → agente | **Pronto / opcional** |
| **Jev / TypeSafe AI** | `JEV_API_BASE_URL` | Decisões auxiliares; chave é cadastrada por organização | **Opcional** |
| **OpenAI Realtime** | `OPENAI_REALTIME_MODEL` | Agente de voz em telefonia | **Opcional** |
| **Sentry** | `SENTRY_DSN` | Erros do app, workers e integrações | **Pronto / recomendado** |
| **Resend** | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Convites, exportações LGPD e alertas | **Pronto / opcional** |
| **SMTP próprio** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | Segundo caminho de e-mail, com preferência configurável no banco | **Pronto / opcional** |
| **Web Push** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Avisos da Central com a aba fechada | **Pronto / opcional** |

As credenciais de IA por organização ficam em **IA → Credenciais**, cifradas com
`AI_CRED_AES_KEY`. As chaves de ambiente funcionam como credencial de plataforma ou
último fallback; preencher `OPENROUTER_API_KEY`, por exemplo, não troca sozinho o
provedor escolhido por uma organização.

## Variáveis fora do `.env.example`

Durante a auditoria apareceram três variáveis usadas pelo código, mas não
documentadas no template principal:

| Variável | Uso encontrado | Ação recomendada |
|---|---|---|
| `VOIP_TRUNK_ENDPOINT` | Fallback do tronco telefônico na API de chamadas | Adicionar ao `.env.example` com instruções de fallback ou remover o fallback do código |
| `VOIP_DEFAULT_CALLER_ID` | Número de origem usado nas chamadas | Adicionar ao `.env.example` junto da configuração telefônica |
| `CRON_SECRET` | Nome reservado que plataformas de cron externas injetam; o app copia para `INTERNAL_CRON_SECRET` em produção | Manter fora do template se o objetivo for documentar apenas segredos próprios; a explicação já está no bloco de cron do `.env.example` |

As duas variáveis `VOIP_*` merecem entrar no próximo ajuste do template; sem isso,
uma instalação que usa telefonia pode funcionar apenas por descoberta no código.

## Voz e telefonia

| Serviço / configuração | Variáveis principais | Dependências | Status |
|---|---|---|---|
| **WaCalls** | `WACALLS_API_BASE_URL`, `WACALLS_API_TOKEN`, `WACALLS_PUBLIC_IP`, `WACALLS_WEBRTC_UDP_PORT`, `COMPOSE_PROFILES=voz` | Serviço WaCalls, IP público e UDP WebRTC publicado | **Opcional / risco operacional** |
| **SIP + Asterisk + voice-agent** | `COMPOSE_PROFILES=telefonia`, `ARI_USERNAME`, `ARI_PASSWORD`, `AUDIOSOCKET_PORT`, `OPENAI_REALTIME_MODEL` | `asterisk/pjsip.conf`, `asterisk/ari.conf`, tronco SIP e portas UDP | **Opcional / módulo separado** |
| **Telefonia por API externa** | `VOIP_TRUNK_ENDPOINT`, `VOIP_DEFAULT_CALLER_ID` | Configuração do tronco e número de origem | **Opcional; confirmar provedor antes de operar** |

Não habilite `voz` ou `telefonia` apenas preenchendo uma variável: os profiles do
Compose também precisam estar ativos e as portas/credenciais devem estar coerentes.

## Plataforma, segurança e operação self-host

| Área | Variáveis principais | Para que serve |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVER_URL`, `SUPABASE_DB_URL`, `SUPABASE_SSL_ROOT_CERT` | Banco, Auth, Storage, Realtime, worker e TLS |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limit, locks e idempotência |
| Cron e provisionamento | `INTERNAL_SECRET`, `INTERNAL_CRON_SECRET`, `TENANT_PROVISIONING_SECRET`, `CRON_SECRET` | Workers, crons e criação de organizações por sistema externo |
| White-label | `APP_NAME`, `APP_LOGO_URL`, `APP_ACCENT_HEX`, `APP_LOCALE` | Marca e idioma inicial da instalação; a marca persistida no banco prevalece |
| Segurança e LGPD | `CPF_ENCRYPTION_KEY`, `LGPD_SIGNING_KEY`, `LGPD_DPO_EMAIL`, `IMPERSONATE_COOKIE_SECRET` | Criptografia, exportação LGPD, DPO e suporte controlado |
| Retenção | `WEBHOOK_LOG_BODY_RETENTION_DAYS`, `WEBHOOK_LOG_ROW_RETENTION_DAYS`, `JOB_QUEUE_RETENTION_DAYS`, `AUDIT_LOG_RETENTION_DAYS` e demais `*_RETENTION_DAYS` | Controlar crescimento do banco sem apagar trabalho pendente |
| Proxy e rede de IA | `IA_DESTINOS_INTERNOS_PERMITIDOS` | Autorizar destinos internos configurados pela instalação, com proteção SSRF |
| Extensões locais | `EXTENSIONS_LOCAL_CATALOG_ORIGIN` | Laboratório local; deve apontar para loopback e não para a rede de uma organização |

## Combinações por nicho

| Nicho | Pacote recomendado |
|---|---|
| Clínica ou serviço local | WAHA + Google Ads/Data Manager + Google Calendar + Resend/SMTP + Sentry |
| E-commerce | WAHA + Nuvemshop + Meta Ads + Google Ads/Data Manager + IA |
| Imobiliária | WAHA + captação por webhook + Google Ads/Data Manager + agenda + IA |
| Agência | Tudo acima por organização + white-label + SMTP próprio + Sentry + Redis |
| Operação com voz | WAHA + SIP/Asterisk + OpenAI Realtime; avaliar WaCalls separadamente |

## Regras de configuração

1. Segredos ficam no `.env` da instalação ou nas credenciais cifradas da organização;
   nunca no código, URL ou frontend.
2. `NEXT_PUBLIC_*` chega ao navegador. Não coloque segredo nessas variáveis.
3. O banco pode prevalecer sobre o `.env` em configurações de organização e em várias
   configurações administrativas; depois de mudar uma tela, não espere que editar o
   `.env` substitua a escolha salva.
4. Integrações com webhook exigem URL pública HTTPS, assinatura e idempotência.
5. Em produção, use o Compose de produção junto com o Compose de roteamento quando a
   VPS já tiver proxy reverso.

## Referências no repositório

- [`.env.example`](../.env.example)
- [`lib/env.ts`](../lib/env.ts)
- [`docs/runbooks/conversoes-de-anuncios.md`](runbooks/conversoes-de-anuncios.md)
- [`docs/runbooks/waha-hostgator.md`](runbooks/waha-hostgator.md)
- [`docs/specs/18-spec-voice-calls-wacalls.md`](specs/18-spec-voice-calls-wacalls.md)
- [`docs/integracao/webhooks-de-saida.md`](integracao/webhooks-de-saida.md)
