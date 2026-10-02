# Fork Axis do DeskcommCRM

Branch de produção: `axis` (nunca `main`, que espelha o upstream). Remotes: `origin` =
`axis-digital/DeskcommCRM` (fork), `upstream` = `melgarafael/DeskcommCRM`.

## O que é nosso (e só isso diverge do upstream)

| Arquivo | Para quê |
|---|---|
| `app/axis-theme.css` | Tokens do design system Axis (claro/navy, raios, sombras, fontes). Não editar `globals.css`. |
| `app/layout.tsx` | 1 import do tema + 3 fontes (`--font-axis-*`) + `preload:false` nas antigas. |
| `app/fonts/inter-variable-latin.woff2` | Inter (OFL), registrada no README de fontes. |
| `docker-compose.axis.yml`, `Caddyfile.axis` | Override de deploy (Traefik do servidor, WAHA externo, imagens locais `:axis`). |
| `lib/waha/client.ts` (+ testes) | WAHA compartilhado (`93c239063`), proxy por sessão (`WAHA_SESSION_PROXY`) e listagem de chats/mensagens. |
| `lib/waha/historico.ts` (+ teste), 1 chamada em `lib/waha/ingest.ts` | Importa o histórico ao parear (QR → WORKING), `WAHA_HISTORY_IMPORT_DAYS`. `ingest.ts` só ganhou `export` em 4 helpers e a chamada em `handleSessionStatus`. |
| `supabase/migrations/…_0900_axis_importacao_de_historico_wa.sql` (+ apêndice no `baseline.sql`, linha no MANIFEST, `tests/invariants/importacao-de-historico-wa-nao-dispara-efeitos.test.ts`) | RPC de importação e `WHEN` em 3 gatilhos de `messages`. **No merge do upstream:** se ele recriar `trg_messages_emit_event`, `trg_demanda_abre_no_inbound` ou `trg_reply_inbound_revision`, reaplicar o `WHEN` (rodar `pnpm test:db` com o teste acima pega a regressão). Número 0900 fora da sequência do upstream. |
| `docs/brand/axis/` | Logo e símbolo oficiais (SVG + PNG prontos para subir em `/admin/marca`). |

## Receber atualização do upstream

```bash
git fetch upstream
git switch axis && git switch -c sync/upstream-AAAA-MM-DD
git merge upstream/main            # conflito provável só em app/layout.tsx (fontes)
pnpm test:unit && pnpm typecheck   # inclui tailwind-tokens e branding
git switch axis && git merge --no-ff sync/upstream-AAAA-MM-DD
```

Depois do merge: conferir se `globals.css` ganhou token novo (`git diff ORIG_HEAD -- app/globals.css`)
e, se sim, definir o valor Axis dele em `app/axis-theme.css` nos DOIS temas.

## Marca em runtime (não é código)

Nome, cor e logo vêm do banco (`/admin/marca`) com `.env` como semente: `APP_NAME`,
`APP_ACCENT_HEX`. O accent passa pela derivação de contraste de `lib/branding`.

**Use `APP_ACCENT_HEX=#C03800`** (o `accent-strong` do design system, branco sobre ele = 5,5:1):
a derivação o mantém. Com o `#F04801` puro ela escurece o botão até `#913214` (marrom). No tema
escuro a própria derivação clareia o accent (`#F96B40`, texto escuro no botão).

Tokens do tema seguem a seção "Cor e contraste" do design system (escalas 50–950, texto em
níveis, `line-control` nas bordas de campo). Exceções registradas em `app/axis-theme.css`:
`text-subtle` fica em ≥4,5:1 (o `ink-subtle` do DS é só 3:1) e `danger` no escuro compartilha o
matiz do accent, como o DS declara.

## Histórico do WhatsApp ao parear

Precisa de DOIS lados ligados: o WAHA recebendo o sync completo
(`WAHA_GOWS_DEVICE_REQUIRE_FULL_SYNC=true` e
`WAHA_GOWS_DEVICE_HISTORY_SYNC_FULL_SYNC_DAYS_LIMIT=365` em `/root/configs/wa-ha/.env`) e o
CRM importando (`WAHA_HISTORY_IMPORT_DAYS=365` no `.env`). O WhatsApp só entrega o histórico
num pareamento NOVO: desconectar e ler o QR de novo. A importação roda em rodadas de 5 min
(até ~1 h) e para quando duas seguidas não acham nada; acompanhar por
`docker logs deskcommcrm-app-1 | grep waha.historico`. Mensagens importadas não acionam agente,
automação nem roteamento; conversa nova entra encerrada.
