-- manifest: o CHECK ga4_conversion_rules_evento_conhecido aceita os eventos de etapa da jornada do comprador (view_item, add_to_cart, schedule, close_unconvert_lead), que o mapa jornada × evento por objetivo do funil sugere (Entrega 1)
--
-- Forward-fix da 0902. A regra por etapa do GA4 só aceitava os quatro eventos
-- de geração de lead (generate_lead, qualify_lead, working_lead,
-- begin_checkout). O mapa jornada × evento (`lib/conversoes/mapa-de-eventos-ga4.ts`)
-- passou a sugerir, conforme o objetivo do funil:
--   - vender produto: view_item (viu o produto) e add_to_cart (vai levar);
--   - agendar: schedule (agendou);
--   - todo objetivo: close_unconvert_lead na etapa de perda.
-- O vocabulário do TypeScript (`EVENTOS_DE_ETAPA_DO_GA4` em
-- `lib/conversoes/regras-ga4.ts`) já os tem; sem esta migration o INSERT da
-- regra cairia em 23514. O par banco × TypeScript é cobrado por
-- `tests/invariants/conversoes-ga4-eventos-da-jornada.test.ts`.
--
-- O evento da venda (`ad_platform_connections.ga4_won_event`) já aceita
-- close_convert_lead e purchase — não muda. `ad_conversion_dispatches.ga4_event_name`
-- (o retrato) não tem CHECK — não muda.
--
-- Sem backfill: o conjunto novo CONTÉM o antigo, então nenhuma linha existente
-- viola a constraint ampliada. Idempotente: drop if exists + add.

alter table public.ga4_conversion_rules
  drop constraint if exists ga4_conversion_rules_evento_conhecido;
alter table public.ga4_conversion_rules
  add constraint ga4_conversion_rules_evento_conhecido
  check (ga4_event in (
    'generate_lead', 'qualify_lead', 'working_lead', 'begin_checkout',
    'view_item', 'add_to_cart', 'schedule', 'close_unconvert_lead'
  ));
