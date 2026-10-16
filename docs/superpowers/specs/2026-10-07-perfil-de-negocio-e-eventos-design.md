# Perfil do negócio no onboarding → funis e eventos de conversão por etapa — DESIGN EM ANDAMENTO

> **Status: brainstorming NÃO concluído (2026-10-07).** Nada aprovado como spec. Próxima sessão retoma em
> "Decisões pendentes". Fluxo: superpowers:brainstorming (caminho ARQUITETURAL) → spec aprovada →
> superpowers:writing-plans. Nenhum código escrito.
>
> Depende de `feat/conversoes-ga4` (plano `docs/superpowers/plans/2026-10-05-conversoes-ga4.md`).

## Pedido do dono (literal)

- "A integração entre deskcomm e GA4 deve fazer o match de eventos conforme a etapa do funil."
- "Identificar o tipo de negócio durante o onboarding para então criar funis e match de eventos
  corretamente. Ex.: loja online (e-commerce), venda de produtos via WhatsApp, venda de serviços pelo
  WhatsApp. O usuário no onboarding informa os canais de vendas e o objetivo (venda de produtos ou
  capturar leads)."
- "Em objetivo pode ser mais de um também."
- Advanced matching: "existem outras exigências para envio de conversões para melhorar o advanced
  matching. Atualize com base nas documentações oficiais."
- Geo: "dados de geolocalização podem ser obtidos via geo_ip disponível no servidor e implementado via
  GTM server-side — verifique a melhor maneira."

## Contexto medido no código (worktree `/root/projects/DeskcommCRM-conversoes-ga4`)

- Onboarding: `app/onboarding/{welcome,funil,...}`. Welcome pergunta só "O que vocês fazem?" (texto livre).
- `lib/onboarding/pacotes-de-funil.ts`: 6 pacotes (`clinica`, `imobiliaria`, `servicos`, `curso`, `loja`,
  `generico`), cada etapa com **passo canônico** `new|contacted|qualifying|qualified|negotiating|won|lost`.
- Passo persistido em `crm_stages.agent_stage_hint` (`lib/onboarding/proposta-de-funil.ts`
  `etapasParaGravar`). `is_won`/`is_lost` derivam do passo. → chave estável para mapear evento, imune a
  renomear coluna. Etapa criada à mão pode não ter passo.
- Vocabulário GA4 hoje (`lib/conversoes/regras-ga4.ts`): etapa `generate_lead|qualify_lead|working_lead|begin_checkout`;
  venda `close_convert_lead|purchase` (por conexão, `ad_platform_connections.ga4_won_event`).
- Vocabulário Meta hoje (`lib/conversoes/regras-meta.ts`): `LeadSubmitted|QualifiedLead|InitiateCheckout|AddToCart|ViewContent` + `Purchase`.
- Google hoje: `Purchase` + qualificação (`google_qualification_stage_id`/`_action_id`), categoria da venda `google_purchase_category`.

## Decisões JÁ TOMADAS pelo dono

1. Onboarding pergunta **canais de venda** (multi) + **objetivo** (multi) — não lista fechada de modelos.
   - canais: `loja_online | whatsapp | instagram | loja_fisica | telefone`
   - objetivos: `vender_produto | vender_servico | captar_lead | agendar`
2. Mapeamento automático: **GA4 primeiro**; Meta/Google em entrega posterior reaproveitando o perfil.
3. Regras GA4 nascem **ao conectar o GA4**: tela propõe regras derivadas, pré-marcadas, para confirmar.
   Vale para org antiga que tenha perfil.
4. A tabela de jornada abaixo **bate com a jornada** (aprovada).

## Proposta em discussão (NÃO aprovada)

- Perfil em `organizations.settings.perfil_de_negocio = { canais[], objetivos[] }`, schema Zod central
  `lib/onboarding/perfil-de-negocio.ts` (sem migration). Editável em Configurações › Organização.
- Como objetivo é multi: **objetivo POR FUNIL** em `crm_pipelines.settings.objetivo` (um só). Onboarding
  cria um funil por objetivo marcado (máx. 3), a partir do pacote (`vender_produto→loja`,
  `agendar→clinica`, `vender_servico→servicos`, `captar_lead→generico`).
- Evento da venda passa a sair do objetivo do funil do negócio; `ga4_won_event` da conexão vira só
  "Evento padrão na venda" (funil sem objetivo). Retrato `ga4_event_name` no livro-razão já protege o reenvio.
- Função pura `eventoSugerido(objetivo, passo)` → evento por plataforma.

### Jornada do comprador × eventos (aprovada)

✅ = suportado no código hoje · 🆕 = nome existe na plataforma, falta no vocabulário · — = não enviar.

| Momento | passo | GA4 | Meta | Google Ads (categoria) |
|---|---|---|---|---|
| 1ª mensagem | new | generate_lead ✅ | LeadSubmitted ✅ / Contact 🆕 | CONTACT / SUBMIT_LEAD_FORM 🆕 |
| Respondido | contacted | — | — | — |
| Entendendo necessidade | qualifying | working_lead ✅ | — | — |
| Qualificado | qualified | qualify_lead ✅ | QualifiedLead ✅ | QUALIFIED_LEAD ✅ |
| **Produto:** escolhendo | qualifying | view_item 🆕 | ViewContent ✅ | — |
| **Produto:** vai levar | qualified | add_to_cart 🆕 | AddToCart ✅ | ADD_TO_CART 🆕 |
| **Produto:** aguardando pagamento | negotiating | begin_checkout ✅ | InitiateCheckout ✅ | BEGIN_CHECKOUT 🆕 |
| **Produto:** pago | won | purchase ✅ | Purchase ✅ | PURCHASE ✅ |
| **Serviço:** orçamento enviado | qualified→negotiating | begin_checkout ✅ | InitiateCheckout ✅ / SubmitApplication 🆕 | REQUEST_QUOTE 🆕 |
| **Agenda:** agendou | negotiating | `schedule` (custom) 🆕 | Schedule 🆕 | BOOK_APPOINTMENT 🆕 |
| **Serviço:** fechou | won | close_convert_lead ✅ (ou purchase com valor) | Purchase ✅ | CONVERTED_LEAD/PURCHASE ✅ |
| Não comprou | lost | close_unconvert_lead 🆕 | — | — |

Consequência: o evento depende de **passo × objetivo do funil** (mesmo `qualified` = `add_to_cart` no
produto e `qualify_lead` no lead). Entrega 1 acrescenta ao vocabulário GA4: `view_item`, `add_to_cart`,
`close_unconvert_lead`.

## Advanced matching (pesquisa)

**Meta CAPI `user_data` — CONFERIDO na doc oficial (2026-10-07):** hash SHA-256: `em` (trim+minúsc.),
`ph` (só dígitos COM DDI), `fn`/`ln` (minúsc., sem pontuação, UTF-8), `ct`/`st`/`zp` (minúsc., sem
espaço/traço), `country` (ISO-2 minúsc., **sempre enviar**), `db` (YYYYMMDD), `ge` (f/m); `external_id`
(hash recomendado). Sem hash: `fbc` (`fb.1.<ts>.<fbclid>`), `fbp`, `client_ip_address`,
`client_user_agent` (obrigatório só para evento de site), `ctwa_clid`, `page_id`, `lead_id`.

**Google Ads `ClickConversion` — lista de campos CONFERIDA:** `gclid`, `gbraid`, `wbraid`,
`user_identifiers`, `consent`, `order_id`, `conversion_date_time`, `conversion_value`, `currency_code`,
`cart_data`, `custom_variables`, `conversion_environment`, `session_attributes_*`, `user_ip_address`.
**Google Ads `user_identifiers` / `consent` — CONFERIDO na doc oficial (2026-10-07,
`developers.google.com/google-ads/api/docs/conversions/upload-clicks` e `.../upload-online`):**
- SHA-256 hex obrigatório em e-mail, telefone, nome, sobrenome e rua. Antes: trim + minúsculas.
- E-mail: só `gmail.com`/`googlemail.com` perdem os pontos e o sufixo `+…` do usuário; os demais
  domínios NÃO (só trim + minúsc.).
- Telefone: E.164 `+<DDI><número>`, validado por `^\+[1-9]\d{6,14}$` (exemplo oficial em Java).
- `UserIdentifier` é **oneof**: um identificador por objeto (e-mail num, telefone noutro, endereço
  noutro). Pôr dois no mesmo objeto apaga o primeiro em silêncio.
- `address_info`: `hashed_first_name` + `hashed_last_name` com hash; `country_code` e `postal_code`
  em texto puro; o exemplo oficial só monta endereço com os quatro presentes.
- Enhanced conversions for leads: com ele, `user_identifiers` é obrigatório; pré-requisitos na conta
  `conversion_tracking_setting.accepted_customer_data_terms` e
  `enhanced_conversions_for_leads_enabled` (sem eles: `CUSTOMER_NOT_ENABLED_ENHANCED_CONVERSIONS_FOR_LEADS`).
- `consent.ad_user_data` (`GRANTED|DENIED`): "highly recommended… If not set, it's possible that your
  conversions won't be attributable." A doc não restringe ao EEE → enviar sempre que a org declarar base.
- `order_id`: se enviado na importação, ajustes futuros têm de usar o mesmo → `lead.id`.
- `user_identifier_source = FIRST_PARTY` (opcional).

**GA4 MP — CONFERIDO na doc oficial (2026-10-07, `.../ga4/uid-data` e `.../protocol/ga4/reference`):**
- `user_data.sha256_email_address[]` (minúsc., sem espaços, gmail/googlemail sem pontos antes do `@`),
  `user_data.sha256_phone_number[]` (só dígitos + prefixo `+`), `user_data.address[]` com
  `sha256_first_name`/`sha256_last_name` (sem dígitos/símbolos, minúsc., trim), `sha256_street`, e em
  **texto puro** `city`, `region` (sem dígitos/símbolos, minúsc.), `postal_code` (sem `.`/`~`),
  `country` (ISO-2). Hash = SHA-256 hex.
- `user_location` {`city`, `region_id` ISO 3166-2 ex. `BR-SP`, `country_id` ISO-2, `subcontinent_id`,
  `continent_id` UN M49} — estruturado, dispensa mandar IP. `ip_override` existe mas mandaria o IP
  do visitante ao Google → **não usar** (coerente com "nunca gravar IP").
- `consent` {`ad_user_data`, `ad_personalization`: `GRANTED|DENIED`}. `user_id` opcional (utf-8).
- `timestamp_micros`: retroativo até **72 h** (já respeitado pelo transporte).
- Divergência entre plataformas no e-mail: Meta = só trim + minúsc.; GA4 = idem + tira pontos do
  usuário gmail/googlemail; Google Ads = idem + tira pontos E `+sufixo` do gmail/googlemail.
  → núcleo comum de normalização com variação por plataforma, nunca um hash só reutilizado nos três.
- A ajuda do GA4 (answer 14077171) trata isso como "user-provided data collection", que se liga no
  Admin da propriedade — **conferir na tela** se é pré-requisito para o MP aceitar `user_data`.

Lacunas no CRM: `external_id`=contact.id 🆕; `fbc`/`fbp`/`fbclid` 🆕; `gbraid`/`wbraid` 🆕;
`order_id`=lead.id no Google 🆕; `user_identifiers` sempre (hoje só na venda sem origem) 🆕;
`consent` 🆕 (precisa base legal declarada pela org, LGPD); `country` do DDI 🆕; separar nome/sobrenome.

## Geolocalização (proposta, NÃO aprovada)

Infra medida: `geoip_api` (MaxMind GeoLite2 City/Country/ASN, atualiza 72h) em `/root/configs/geoip`,
`GET http://geoip_api:8080/ip/<ip>` → país, estado (iso), cidade, CEP. Doc `/root/docs/geoip-api-gtm.md`.
`deskcommcrm-app-1` e `-worker-1` (produção) estão na `network_public` → alcançam `geoip_api:8080`.
Staging é isolado (não alcança; usar URL pública ou sem geo). IP do visitante: `lib/http/ip-do-cliente.ts`.

Recomendação: **resolver no CRM na hora da captura** (link de rastreio / `pagina-de-captura.ts`), env
opcional nova `GEOIP_API_URL` (vazia = sem geo; Axis = `http://geoip_api:8080`); gravar só o DERIVADO
(país/estado/cidade) em `source_metadata`, NUNCA o IP (LGPD); falha do geo nunca falha a captura.
Envio: Meta `country`/`st`/`ct` hash (sem `zp` — CEP por IP não confiável); Google `address_info`;
GA4 `user_location`. País preferencialmente do DDI. Cidade só com raio de precisão pequeno (IP móvel BR
cai na cidade da operadora) → exige acrescentar `accuracy_radius` ao `app.py` do geoip.
**Não** rotear conversões do CRM pelo sGTM: o "Client IP Address" seria o do servidor do CRM; perderia
livro-razão/reenvio; produto open-source não pode depender de sGTM. sGTM segue certo para eventos do site.

## Divisão proposta em entregas (NÃO aprovada)

1. Perfil do negócio no onboarding + objetivo por funil + mapeamento automático GA4 (+ vocabulário GA4).
2. Identidade unificada (`lib/conversoes/identidade-do-contato.ts`, um normalizador/hash para os 3
   transportes) + captura ampliada (fbc/fbp/gbraid/wbraid/geo) + consentimento + "o que foi casado" no Histórico.
3. Mapeamento automático Meta e Google (Google exige ação de conversão criada na conta por categoria).

## Decisões pendentes (retomar aqui)

1. Objetivo **por funil** + evento da venda saindo do funil (conexão = padrão)? — perguntado, sem resposta.
2. Divisão em 3 entregas? — perguntado, sem resposta.
3. Desenho do geo (captura no CRM + `GEOIP_API_URL` + só derivado)? — perguntado, sem resposta.
4. ~~Conferir na doc oficial: GA4 `user_data`/`user_location`; normalização Google `user_identifiers` e `consent`.~~
   Feito em 2026-10-07 (sessão 10) — ver "Advanced matching".
5. Destino (DoD 18): onboarding e conversões são núcleo — confirmar na spec.
6. Depois: apresentar seções restantes do design (fluxo de dados, erros, testes) → escrever spec final →
   revisão do dono → writing-plans.
