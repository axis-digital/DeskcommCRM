# Fork Axis do DeskcommCRM

Branch de produção: `main` do fork (`origin/main`); não existe branch `axis` (`git branch -a --list '*axis*'`
devolve vazio) e a `main` **não** espelha o upstream. Todo PR é aberto só no fork (`gh pr create -R axis-digital/DeskcommCRM`,
ver `CLAUDE.md`). Remotes: `origin` = `axis-digital/DeskcommCRM` (fork), `upstream` = `melgarafael/DeskcommCRM`.

**A ponta da `main` não é o que roda em produção.** O que roda é a imagem `:axis` construída no host, e ela
carrega o commit em `APP_VERSION`. Antes de qualquer sync ou deploy, meça a distância:

```bash
docker exec deskcommcrm-app-1 printenv APP_VERSION                  # 1.x.y-axis-<sha7>: o sha é o que vale, o número pode estar defasado
git rev-list --count <sha7>..origin/main                            # commits que o próximo deploy leva
git diff --name-only --diff-filter=A <sha7> origin/main -- supabase/migrations | wc -l   # migrations novas
```

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
| `supabase/migrations/…_0900_axis_importacao_de_historico_wa.sql` (+ apêndice no `baseline.sql`, linha no MANIFEST, `tests/invariants/importacao-de-historico-wa-nao-dispara-efeitos.test.ts`) | RPC de importação e `WHEN` em 3 gatilhos de `messages`. **No merge do upstream:** se ele recriar `trg_messages_emit_event`, `trg_demanda_abre_no_inbound` ou `trg_reply_inbound_revision`, reaplicar o `WHEN` (rodar `pnpm test:db` com o teste acima pega a regressão). Número 0900 fora da sequência do upstream. A `…_0901_axis_dedup_historico_pela_cauda_do_id.sql` (+ apêndice) redefine a mesma função: dedup também pela cauda do id na mesma conversa (`@lid` do webhook × `@c.us` da listagem). Os dois apêndices ficam antes da VARREDURA, 0900 e depois 0901. |
| `hostgator-setup-kit/_common.sh`, `install.sh` | `COMPOSE_EXTRA_FILES` (overrides locais acrescentados em todo `docker compose` do kit). |
| `scripts/axis-sync-upstream.sh` | Sync com o upstream (ver abaixo). |
| `docs/brand/axis/` | Logo e símbolo oficiais (SVG + PNG prontos para subir em `/admin/marca`). |

## Receber atualização do upstream

**Antes de mesclar, leia o que mudou** no changelog público do produto:
<https://www.deskcomm.com.br/changelog> (uma entrada por versão; o script mostra qual é a mais
nova no upstream). Procure migrations, variáveis novas e mudanças no WAHA.

```bash
scripts/axis-sync-upstream.sh              # fetch, conta atrás/à frente, cria merge/upstream-AAAA-MM-DD
                                           # a partir de origin/main, mescla upstream/main, roda typecheck + test:unit
```

O script exige árvore limpa, nunca faz rebase/reset/force e **não** mescla em `main`, não dá push
de `main` e não faz deploy (a antiga opção `--push-main` foi removida: ela empurrava o upstream para a
`main` do fork). Em conflito ele para e lista os arquivos com os pontos do fork que costumam
conflitar. Sem conflito, ele imprime o próximo passo:

```bash
pnpm test:db                                   # se o upstream trouxe migration (sem rede: CONFERENCIA_KIT_RELEASE=vX.Y.Z)
git push -u origin merge/upstream-AAAA-MM-DD
gh pr create -R axis-digital/DeskcommCRM --base main --head merge/upstream-AAAA-MM-DD
# depois do merge do PR e do "Antes de atualizar a produção" abaixo:
# rebuild das imagens :axis (app, worker — o scheduler segue a imagem publicada do upstream) e deploy com docker-compose.axis.yml
```

Não há GitHub Action para isso de propósito: o fork herdaria os workflows do upstream.

## Antes de atualizar a produção

O deploy leva o banco junto: migrations chegam pelo `baseline.sql` no `update.sh`. Antes de subir qualquer
imagem nova, **o dump lógico e o restore têm de ter sido provados**, não presumidos.

O backup do host (timers `axis-backup-*`, `systemctl list-timers | grep axis-backup`) copia arquivos, e o
diretório de dados do Postgres do Deskcomm (`.runtime/supabase/volumes/db/data`, bind mount) está dentro dele
com o banco em uso. Isso não substitui um dump lógico.

```bash
# 1. dump lógico (somente leitura; permissão 600)
umask 077; OUT=/root/backups/deskcomm/baseline-logico-$(date +%Y%m%d-%H%M).dump
docker exec deskcommcrm-supabase-db-1 pg_dump -U postgres -d postgres -Fc --no-comments > "$OUT"
docker exec -i deskcommcrm-supabase-db-1 pg_restore --list < "$OUT" | grep -c ' TABLE DATA '   # tem de ser > 0

# 2. restore de ensaio num Postgres EFÊMERO da MESMA major da produção (select version() em prod), sem rede
docker run -d --name deskcomm-restore-ensaio --network none -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" supabase/postgres:<tag da mesma major>
docker exec deskcomm-restore-ensaio psql -U supabase_admin -d postgres -c "create database restore_test"
docker exec -i deskcomm-restore-ensaio pg_restore -U supabase_admin -d restore_test --no-comments < "$OUT"

# 3. veredito pela CONFERÊNCIA DO RESULTADO (como o restore.sh do kit), não pelo exit code do pg_restore:
#    contagem por tabela em produção x restaurado; as centrais têm de ser idênticas.
docker rm -f deskcomm-restore-ensaio
```

Esperado no ensaio: erros de `role "..." does not exist` (donos e grants de papéis que só existem em
produção, ex.: `supabase_realtime_admin`, `supabase_functions_admin`, `dlt_nuvemshop_ro`) e nenhum outro tipo.
Tabelas com escrita contínua (`messages`, `event_log`, `api_audit_log`, `webhook_events_log`) diferem pela
deriva entre o dump e a contagem, com o restaurado **menor** que a produção; diferença para o outro lado ou
em tabela central é defeito. Um PG de major diferente da produção não é prova de restore.

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
