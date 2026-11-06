# Registro de releases do fork Axis

Complementa [`axis-fork.md`](axis-fork.md) (o que é nosso e como receber o upstream) e a doutrina de
[`doctrine/packaging.md`](doctrine/packaging.md). Aqui fica **o que está rodando em produção, com que
identidade, e como se promove e se desfaz**.

## Regra

O que roda em produção é um **artefato do CI**, identificado por **tag de release + digest**. Imagem
construída no host é exceção de emergência e é dívida (`CLAUDE.md`, "Deploy em produção"). O CI do fork
publica `app`, `worker` e `scheduler` no GHCR (privado) a cada push na `main`, e as releases `X.Y.Z` a
cada tag `v*`. Ele **não** publica tag por SHA: o que identifica uma imagem sem ambiguidade é a release
`X.Y.Z` e o digest; `latest`, `main` e `stable` se movem.

## Como conferir o que roda (comandos, não números)

```bash
# commit e versão que o container carrega
docker exec deskcommcrm-app-1 printenv APP_VERSION        # o sha de 7 dígitos é o que vale
# imagem exata de cada serviço
for c in app worker scheduler; do docker inspect deskcommcrm-$c-1 --format '{{.Name}} {{printf "%.19s" .Image}} {{.Config.Image}}'; done
# a imagem tem digest de registry? (vazio = construída no host)
docker image inspect deskcomm-app:axis --format '{{len .RepoDigests}} {{.RepoDigests}}'
# digest publicado de uma release
docker buildx imagetools inspect ghcr.io/axis-digital/deskcommcrm:X.Y.Z | grep -m1 '^Digest:'
# quanto a main andou desde o que roda
git rev-list --count <sha7>..origin/main
```

## Release 0 — o que rodava em 2026-11-05 (medido)

Linha de base, antes de qualquer promoção por digest. É um registro histórico: re-meça com os comandos acima.

| Item | Valor |
|---|---|
| Commit | `4483e76f0` (PR #40, 2026-10-28), tag `v1.94.1` |
| Origem das imagens | **Construídas no host** (tags locais `:axis`, `pull_policy: never`, 0 `RepoDigests`, sem labels `revision`/`version`) |
| Imagens locais (ID) | app `a41bba2f81a9`, worker `371c27e01e6d`, scheduler `27814747a9cb`, criadas em 2026-10-28 19:00 (+01:00) |
| `APP_VERSION` | `1.94.0-axis-4483e76` nos três serviços |
| Equivalente publicado pelo CI (mesmo commit, **outro build**) | `1.94.1` — app `sha256:407966240bd29953433cd8afd55b4d815ccfb548886f02c288e86e49390138fd`, worker `sha256:652f8a668f04e7619380d2fe52190922b3031de21c54134157eabae21b5b21c4`, scheduler `sha256:e3daafb921594f87a9e12d160e4680e44003c53ad560b1e7e001544e979df8e9` |
| Pontos de volta locais | `deskcomm-{app,worker,scheduler}:axis-prev`, `axis-rollback-AAAAMMDD` (`docker images 'deskcomm-*' \| grep rollback`) |

Observações da medição: o mesmo commit tem dois artefatos distintos (o do host e o do CI), então "mesma versão"
não implica "mesma imagem"; e o `APP_VERSION` do build do host (`1.94.0`) não coincide com a tag do commit
(`v1.94.1`).

## Promover uma release (procedimento)

Nada disto atualiza produção sozinho; cada passo é uma decisão humana. Foi exercitado em produção uma vez, em
2026-11-06 (seção "Promoção de 2026-11-06" abaixo); cada nova promoção deve ganhar a sua linha na tabela.

1. A release `vX.Y.Z` existe, está contida na `main` e o CI publicou as três imagens (`imagens-ok`).
2. **Dump lógico e restore de ensaio** do banco de produção (`axis-fork.md`, seção "Antes de atualizar a
   produção"; existe também o dump diário do host, descrito em `/root/SERVER_MAP.md` do servidor, em
   `/root/backups/deskcomm/diario/`).
3. **Staging na mesma release**, com o `supabase/baseline.sql` aplicado ao banco do staging: imagem nova sem schema
   novo é código à frente do banco. Conferir `/` = 200 e `/app` = 307.
4. Puxar **por digest** e guardar o ponto de volta:

   ```bash
   docker tag deskcomm-app:axis deskcomm-app:axis-rollback-AAAAMMDD     # idem worker e scheduler
   docker pull ghcr.io/axis-digital/deskcommcrm@sha256:<digest>          # idem worker e scheduler
   docker image inspect ghcr.io/axis-digital/deskcommcrm@sha256:<digest> --format '{{.RepoDigests}}'   # tem de listar o digest
   ```

5. Apontar o compose para a imagem puxada e recriar com **os mesmos arquivos de compose de sempre**
   (`docker-compose.prod.yml`, `docker-compose.single-server.yml`, `docker-compose.axis.yml`).
6. Conferir `APP_VERSION` nos três serviços, `/` = 200 e `/app` = 307, e **registrar a linha** na tabela
   "Releases promovidas" abaixo (versão, commit, os três digests, migrations aplicadas, data, ponto de volta).

**Rollback:** retornar as três imagens ao ponto de volta guardado no passo 4. Isso **não** desfaz o banco: se
a release trouxe migration, o retorno do schema é restaurar o dump do passo 2 (ou o diário do host).

## Releases promovidas

| Data | Release | Commit | Digests (app / worker / scheduler) | Migrations | Ponto de volta |
|---|---|---|---|---|---|
| 2026-11-05 | release 0 (host) | `4483e76f0` | — (sem digest; ver tabela acima) | — | `axis-rollback-20261028` |
| 2026-11-06 | `1.94.1` (CI, por digest) | `4483e76f0` | app `407966240bd2…`, worker `652f8a668f04…`, scheduler `e3daafb92159…` (completos na tabela "Release 0") | nenhuma (mesmo commit e mesmo schema) | `deskcomm-{app,worker,scheduler}:axis-rollback-20261106` e o dump `baseline-20261106-0203.dump` |

### Promoção de 2026-11-06 (produção)

Troca das imagens construídas no host pelas do CI da **mesma** release (`1.94.1`, commit `4483e76f0`), fixadas por
digest. Sem migration e sem mudança de código: só a identidade do artefato.

| Passo | Resultado medido |
|---|---|
| Ponto de volta | dump lógico do banco (`/root/backups/deskcomm/diario/`, `sha256` conferido), tags `deskcomm-{app,worker,scheduler}:axis-rollback-20261106` e cópia do `.env` |
| Composição | override `docker-compose.prod-ci.yml` somado a `docker-compose.prod.yml`, `docker-compose.single-server.yml` e `docker-compose.axis.yml`; a única diferença na composição resolvida foi `image` e `pull_policy` (rótulos do Traefik, redes e volumes iguais) |
| Execução | `docker compose ... up -d --no-deps app worker scheduler`, rodado pelo dono no host |
| Saúde | os três `healthy`, 0 reinícios; `APP_VERSION=1.94.1` (antes `1.94.0-axis-4483e76`); `/` 200, `/app` 307, `/api/v1/health` 200 com Supabase, Redis e WAHA ok; 0 erros de log |
| Identidade | a imagem em uso passou a ter `RepoDigests`; `system_version` mostra `off_release=false` e a revisão `4483e76f0…`; o heartbeat do agente chegou depois da troca |
| Persistência | `COMPOSE_EXTRA_FILES="docker-compose.axis.yml docker-compose.prod-ci.yml"` no `.env`, para que `up` feito pelo kit não volte às imagens `:axis` |

O que **não** foi provado: telas logadas e envio pelo WhatsApp em produção (só saúde e rotas públicas) e o
comportamento sob tráfego (a troca foi de madrugada). `compare_failed=true` continua, porque o fork não tem GitHub
Release (ver a seção do `agent.sh`).

Dívidas conhecidas: o override `docker-compose.prod-ci.yml` existe só no host (não versionado) e se perde se o
diretório for recriado; o `.env` de produção ainda cita `APP_IMAGE` e `WORKER_IMAGE` do upstream (valores inertes,
o override os substitui).

**Para voltar:** retirar `docker-compose.prod-ci.yml` de `COMPOSE_EXTRA_FILES` (a cópia do `.env` anterior está em
`/root/backups/deskcomm/`) e subir `app worker scheduler` de novo com os mesmos arquivos de compose; as imagens
`deskcomm-*:axis` e `:axis-rollback-20261106` seguem no host. Esta troca não alterou o banco.

## Staging

O staging deve rodar a mesma release que se pretende promover. Medir com os mesmos comandos de "Como
conferir", trocando `deskcommcrm-*` por `deskcomm-staging-*`.

Em 2026-11-05, antes do ensaio abaixo, ele estava em `a3019b912` (PR #37), com imagens construídas no host e o
scheduler na imagem do upstream `1.74.0`, isto é, **fora da linha de produção**.

### Ensaio de promoção por digest no staging (2026-11-05)

Primeiro uso do procedimento acima, no staging. **A produção não foi tocada** e continua na release 0.

| Passo | Resultado medido |
|---|---|
| Ponto de volta | dump lógico do banco do staging (265 tabelas com dados) e tags `deskcomm-{app,worker}:staging-pre-ci-AAAAMMDD` |
| Imagens | as da release `1.94.1` pelos três digests da tabela "Release 0", via um override de compose que só existe no host (`docker-compose.staging-ci.yml`, não versionado) |
| Schema | `reaplicar_baseline` do próprio kit com o `supabase/baseline.sql` de `4483e76f0`: 1 passada, 0 erros; as colunas `runtime_confirmation` (migration 9024) e `force_requested` (9025) passaram a existir |
| Checkout | movido de `a3019b912` para `4483e76f0` |
| Saúde | `app`, `worker` e `scheduler` `healthy`; `APP_VERSION=1.94.1` nos três; `/` 200, `/app` 307, `/api/v1/health` 200 |
| Identidade de runtime | `GET /api/v1/system/version` (sessão de super-admin): `identity.status=confirmed`, `revision=4483e76f0…`, `customized=false`, três serviços com a mesma revisão, `agent_online=true` |
| Navegador (Chromium) | login, redirecionamento ao onboarding, onboarding, `/admin/sistema` (200): 0 erros de console e 0 respostas HTTP com status 400 ou mais |

O que **não** foi provado, e não deve ser tratado como provado:

- O painel de atualização (`/app/settings/atualizacao`) não foi renderizado: ele fica atrás do onboarding, que conecta
  WhatsApp e IA (efeitos externos). Só a API que o alimenta foi lida.
- Telas pós-onboarding (inbox, CRM) e envio pelo WhatsApp.
- O botão "Atualizar agora" nunca foi acionado: no staging o `agent.sh` roda por cron a cada 5 minutos e executaria um
  `update.sh` de verdade.
- O banco do staging tem 48 MB, contra 1,1 GB da produção; o tempo e a carga do baseline em produção não foram medidos.
- Na resposta da API, `compare_failed=true` e `official_latest_version` vazio: o staging não comparou com a última
  release oficial. Não foi verificado se a produção se comporta igual; conferir antes de promover.

Para repetir a leitura da identidade: com uma sessão de super-admin, `GET /api/v1/system/version` e conferir
`identity.status`, `identity.revision`, `identity.customized` e `runtime_services[*].revision`. Para voltar o staging
ao estado anterior, apague o override e suba os serviços sem ele (as imagens `:staging` e a `1.74.0` seguem no host).

## O `agent.sh` do host (classificação medida em 2026-11-05)

`hostgator-setup-kit/agent.sh` roda por cron a cada 5 minutos, em produção e no staging. Ele **não** é só um verificador
de saúde nem um atualizador automático: tem três funções.

| Função | O que faz | Quem aciona |
|---|---|---|
| Heartbeat | envia ao app versão, revisão e confirmação de runtime (alimenta `system_version`) | o cron |
| Executor | roda `update.sh --to <tag>` | **só um pedido humano** (`update_requested`, vindo do botão "Atualizar agora") |
| Rollback automático | se o app ficar fora do ar logo depois de uma atualização, roda `update.sh --to <versão anterior> --force` | o próprio agente, só depois de uma atualização |

Ele nunca atualiza sozinho. O botão só é oferecido quando há release anunciada.

**Por que a atualização está dormente neste fork.** O agente descobre a última release na API de Releases do GitHub do
`origin` (`ultima_release_estavel`, em `_common.sh`). O fork tem tags, mas **nenhuma Release publicada**
(`gh api repos/axis-digital/DeskcommCRM/releases/latest` devolve 404). Nada é anunciado, e `system_version` mostra
`latest_version` vazio e `compare_failed=true` em produção e no staging. Isso não é defeito das imagens do CI.
`off_release=true` em produção é esperado: as imagens construídas no host não são a release oficial.

**Risco.** O `update.sh` foi escrito para instalações que seguem o upstream. Esta produção é customizada: o `.env` carrega
`APP_IMAGE` do upstream (valor inerte) e o `docker-compose.axis.yml` força `deskcomm-app:axis` com `pull_policy: never`.
Inferência, **não testada**: um `update.sh` em produção regravaria o `.env` e moveria checkout e banco, mas a imagem em
execução continuaria a `:axis` local. O agente recusa execuções "incompletas ou personalizadas"; essa guarda foi lida, não
exercitada.

**Regras até a promoção por digest existir:**

1. Manter o cron do `agent.sh` como heartbeat (ele alimenta a identidade de runtime).
2. **Não publicar uma Release no GitHub do fork**: o agente passaria a anunciar a atualização e a tela a oferecer o botão.
3. Ninguém aciona "Atualizar agora" em produção nem no staging.
4. Depois da primeira promoção por digest, reavaliar se o `agent.sh` pode ser o executor oficial.

Comandos para re-medir: `gh api repos/axis-digital/DeskcommCRM/releases/latest` (404 = sem Release) e, no banco,
`select latest_version, compare_failed, off_release, agent_last_seen_at from public.system_version`.
