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
| `lib/waha/gows.ts` (+ `gows.test.ts`) e 5 pontos em `lib/waha/ingest.ts` (`resolveMessageType`, `notifyNameOf`, `bodyOf`, `telefoneAlternativoDe`/`telefoneDoJid`, guarda do outbound) | Leitura do payload GOWS (`_data.Info`/`_data.Message`): telefone do `@lid` em `SenderAlt`/`RecipientAlt` (sem isso nasce contato duplicado só-LID), `PushName` e texto de template de empresa. A direção exige `fromMe` e `Info.IsFromMe` concordando — na dúvida, sem telefone (senão o número do operador vira o do cliente). Lacuna conhecida: autor de grupo GOWS fica só com o LID. O upstream só mede NOWEB. |
| `lib/waha/historico.ts` (+ teste), 1 chamada em `lib/waha/ingest.ts` | Importa o histórico ao parear (QR → WORKING), `WAHA_HISTORY_IMPORT_DAYS`. A parte de histórico em `ingest.ts` é `export` de 4 helpers e a chamada em `handleSessionStatus` (o resto do diff do arquivo é a linha GOWS acima). |
| `supabase/migrations/…_0900_axis_importacao_de_historico_wa.sql` (+ apêndice no `baseline.sql`, linha no MANIFEST, `tests/invariants/importacao-de-historico-wa-nao-dispara-efeitos.test.ts`) | RPC de importação e `WHEN` em 3 gatilhos de `messages`. **No merge do upstream:** se ele recriar `trg_messages_emit_event`, `trg_demanda_abre_no_inbound` ou `trg_reply_inbound_revision`, reaplicar o `WHEN` (rodar `pnpm test:db` com o teste acima pega a regressão). Número 0900 fora da sequência do upstream. |
| `hostgator-setup-kit/_common.sh`, `install.sh` | `COMPOSE_EXTRA_FILES` (overrides locais acrescentados em todo `docker compose` do kit). |
| `scripts/axis-sync-upstream.sh` | Sync com o upstream (ver abaixo). |
| `docs/brand/axis/` | Logo e símbolo oficiais (SVG + PNG prontos para subir em `/admin/marca`). |

## Receber atualização do upstream

**Antes de mesclar, leia o que mudou** no changelog público do produto:
<https://www.deskcomm.com.br/changelog> (uma entrada por versão; o script mostra qual é a mais
nova no upstream). Procure migrations, variáveis novas e mudanças no WAHA.

```bash
scripts/axis-sync-upstream.sh              # fetch, conta atrás/à frente, cria sync/upstream-AAAA-MM-DD
                                           # a partir de axis, mescla upstream/main, roda typecheck + test:unit
scripts/axis-sync-upstream.sh --push-main  # idem, e atualiza o espelho `main` do fork (origin/main)
```

O script exige árvore limpa, nunca faz rebase/reset/force e **não** mescla em `axis`, não dá push
de `axis` e não faz deploy. Em conflito ele para e lista os arquivos com os pontos do fork que
costumam conflitar. Sem conflito, ele imprime o próximo passo:

```bash
pnpm test:db                                   # se o upstream trouxe migration (sem rede: CONFERENCIA_KIT_RELEASE=vX.Y.Z)
git switch axis && git merge --no-ff sync/upstream-AAAA-MM-DD
git push origin axis
# rebuild das imagens :axis (app, worker — o scheduler segue a imagem publicada do upstream) e deploy com docker-compose.axis.yml
```

Não há GitHub Action para isso de propósito: o fork herdaria os workflows do upstream.

Pontos de atenção no merge:

- **`supabase/baseline.sql`:** o apêndice da 0900 fica **antes** do bloco
  `-- ---- VARREDURA anon:` (o upstream exige que nenhuma função seja criada depois dele —
  `tests/unit/varredura-anon-e-o-ultimo-bloco.test.ts`). Apêndices novos do upstream entram antes
  da varredura também, então a 0900 vai para logo antes dela.
- **`hostgator-setup-kit/_common.sh` e `install.sh`:** o fork acrescenta `COMPOSE_EXTRA_FILES` em
  `dc()`/`dc_files()`, sempre DEPOIS dos overlays do kit (inclusive o da CA do Supabase).
- **`lib/waha/client.ts`:** a criação de sessão parte de `configDeCriacao()` (webhook por sessão e
  proxy); o que o upstream acrescentar ao `config` entra por cima dela.
- `git diff ORIG_HEAD -- app/globals.css`: se houver token novo, definir o valor Axis dele em
  `app/axis-theme.css` nos DOIS temas.
- `pnpm typecheck` pode estourar a heap padrão do Node; o script usa
  `NODE_OPTIONS=--max-old-space-size=8192`.

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
