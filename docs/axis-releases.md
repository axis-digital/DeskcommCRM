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

Confirmado pelo dono depois da troca (2026-11-06): a **inbox de produção funciona** com as imagens do CI.

O que **não** foi provado: as demais telas logadas, o envio de mensagem pelo WhatsApp (não consta que tenha sido
testado) e o comportamento sob tráfego (a troca foi de madrugada). `compare_failed=true` continua, porque o fork
não tem GitHub Release (ver a seção do `agent.sh`).

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

### Promoção do staging para a `main` nova (2026-11-06)

Staging promovido para o commit `40c6faec7` (PR #62, sync da upstream v1.102.0) **por digest**, com as imagens que o
CI publicou para esse commit. **A produção não foi tocada** (`deskcommcrm-*` segue como estava; nenhum `update.sh`,
nenhum "Atualizar agora").

| Passo | Resultado medido |
|---|---|
| Imagens (labels `org.opencontainers.image.revision` = `40c6faec7dd8…`) | app `sha256:c5327964c9e14ea6bc689222f35e1e60d83e39d30a408e293b1e87287c2de9be`, worker `sha256:c5cb2bf5a521792a3dd41c0c6c675708b3f0f980a249efa0ab60b6650c91c9fd`, scheduler `sha256:559f630e76b8bb73cb0011dc0574ecf8bc00e4ad8dba2216c67a0fb1cd6186b4` |
| Ponto de volta | dump lógico do banco do staging (`pg_restore -l`: 265 entradas de dados; 47 MB no banco) em `/root/backups/deskcomm/staging/`; tags `deskcomm-{app,worker,scheduler}:staging-pre-sync-1106` (imagens da 1.94.1); override anterior em `docker-compose.staging-ci.yml.bak-20261106` |
| Composição | `docker-compose.staging-ci.yml` (só no host) reescrito com os três digests novos, somado a `prod`, `single-server` e `staging`; `config -q` OK |
| Schema | `reaplicar_baseline` do kit com o `supabase/baseline.sql` de `40c6faec7`: **1 passada, 0 linhas de erro** (nem as benignas); traz a 9903 |
| Checkout | `/root/projects/deskcomm-staging` movido de `4483e76f0` para `40c6faec7` (detached) |
| Execução | `up -d --no-deps app worker scheduler` com `-p deskcomm-staging` |
| Saúde | os três `healthy`, 0 reinícios; `APP_VERSION=40c6fae` nos três; `/` 200, `/app` 307, `/api/v1/health` 200 (Supabase, Redis e WAHA ok); `system_version.current_version=40c6faec7`; 0 linhas de log `error`/`fatal` no app |

Prova pela tela (Chromium via Playwright, 1440×900; medidas por `getBoundingClientRect`, `getComputedStyle`, contagem de
roles e captura de console/HTTP; evidência em `evidence/staging-sync-1106/`, dados brutos em `resultado.json` e
`resultado-2.json`). Contas: um usuário admin da organização já onboardada e o admin da plataforma do staging.

| Tela | Estado | Medido | Evidência |
|---|---|---|---|
| Ficha do negócio | **funciona** | 10 cards com nome acessível `Negócio: <título>` e 0 com `Lead: `; 10 botões `Ações do negócio`, 0 `Ações do lead`; a ficha abre (dialog 1152×900) com a seção "Dados do negócio". O "Negócio:" é o `aria-label` do card, não texto visível | `evidence/staging-sync-1106/01-ficha-do-negocio.png` |
| Admin | **funciona** | `/admin/dashboard` 200 (h1 "Dashboard", 19 itens de menu); `/admin/sistema` 200 (h1 "Recursos opcionais", 13 interruptores); 0 erros de console, 0 respostas ≥ 400 | `evidence/staging-sync-1106/02a-admin-dashboard.png`, `evidence/staging-sync-1106/02b-admin-sistema.png` |
| Editor de funil (`/app/settings/tenant/pipelines`) | **funciona** | título "Etapas do funil", 8 etapas com os nomes do funil Pedidos, 8 botões Arquivar, "Acrescentar etapa ao fim" e "Salvar estas escolhas" presentes; 0 erros. Não salvei nada | `evidence/staging-sync-1106/03-editor-de-funil.png` |
| Welcome (`/onboarding/welcome`) | **funciona** | com a organização ainda sem onboarding: título "Boas-vindas ao Axis CRM", 6 rótulos de etapa, botão "Continuar"; 0 erros. Com a organização já onboardada, a rota redireciona para `/app/inbox` (esperado) | `evidence/staging-sync-1106/04-welcome.png` |
| Cold Call | **funciona, mas só ligado** | módulo opcional, desligado por padrão: `/app/cold-call` devolve a tela 404 do app (desenho, #3933). Liguei o interruptor em `/admin/sistema` pela tela (`aria-checked` false→true, persistiu após reload): a página abre com h1 "Cold Call" e o botão "Criar funil de cold call", 0 erros. **Desliguei de novo**: o staging ficou como estava (`aria-checked=false`). Não criei funil nem importei lista. O link "Cold Call" não aparece no menu em nenhum dos dois estados medidos | `evidence/staging-sync-1106/05a-cold-call-desligado.png`, `evidence/staging-sync-1106/05b-admin-liga-cold-call.png`, `evidence/staging-sync-1106/05c-cold-call-ligado.png` |
| Pino de localização GOWS | **funciona** | um webhook `message` com o payload GOWS (`_data.Info`/`Message.locationMessage`, `location`, `body` vazio) para o token da sessão: HTTP 200, linha em `messages` com `type=location` e `metadata.location` (nome, endereço, lat/lon); na tela o cartão (260×58) com o texto do pino, `href=https://maps.google.com/?q=-19.9167,-43.9345`, `target=_blank`, e o mesmo pino na ficha do negócio | `evidence/staging-sync-1106/06-pino-de-localizacao-gows.png` |

O que **não** foi provado:

- O pino chegou por **webhook sintético** (sem assinatura, que o staging aceita porque `WAHA_WEBHOOK_REQUIRE_SIGNATURE=false`),
  não de um aparelho com engine GOWS: prova a ingestão e a renderização, não a entrega real do WAHA. A sessão do staging é NOWEB.
- Envio de mensagem pelo WhatsApp, o painel "Atualizar agora" e o comportamento sob tráfego.
- O fluxo completo do Cold Call (criar funil, importar lista, ligar).

Observações: o dossiê chama `GET /api/v1/proposals?lead_id=…` e recebe 404 porque a capacidade "propostas" está desligada
nesta organização; a seção `PropostasDoNegocio` se oculta nesse caso (desenho desde 2026-09-27, não vem deste sync).
Ficou no staging, por conta desta prova, o contato/negócio de teste "Prova Sync 0611" (+5531900001106) na organização principal.
`system_version` no staging mostra `off_release=true` e `compare_failed=true`, como antes (o fork não tem GitHub Release).

**Para voltar o staging:** apagar `docker-compose.staging-ci.yml` e subir `app worker scheduler` sem ele, ou apontar o
override para as imagens `deskcomm-*:staging-pre-sync-1106`; o schema só volta restaurando o dump acima.

### Promoção do staging para `877d31613` — `/docs/changelog` (2026-11-10)

Staging promovido para o commit `877d31613` (PR #66, página pública `/docs/changelog`) **por digest**, com as imagens que o
CI publicou para esse commit. **A produção não foi tocada** (`deskcommcrm-*` segue como estava; nenhum `update.sh`,
nenhum "Atualizar agora"). Mudança sem schema: o diff de `supabase/` entre `40c6faec7` e `877d31613` é vazio, então o
baseline **não** foi reaplicado.

| Passo | Resultado medido |
|---|---|
| Imagens (labels `org.opencontainers.image.revision` = `877d316137d0` nas três) | app `sha256:cea1d5b2187754a3a0933eb7f24458c26c3e458f5db6b7a3c374f48df8c006ab`, worker `sha256:bf815373a9e8e93e43c9bcd06c71b00bcb9236474c82f2cd56247ecdc0fd7bc2`, scheduler `sha256:4c337ac17d4e0b88a752e3d1863c9ac63e4f31e17cc9d8e896dd1bb902d5a9d3` (digests do índice multi-arquitetura; `RepoDigests` das três lista o digest pedido) |
| Ponto de volta | dump lógico do banco do staging (`pg_restore -l`: 273 entradas `TABLE DATA`; 51 MB no banco) em `/root/backups/deskcomm/staging/staging-pre-changelog-20261110-1525.dump`, com `.sha256`; tags `deskcomm-{app,worker,scheduler}:staging-pre-changelog-1110` (imagens do `40c6faec7`); override anterior em `docker-compose.staging-ci.yml.bak-20261110` |
| Composição | `docker-compose.staging-ci.yml` (só no host) reescrito com os três digests novos, somado a `prod`, `single-server` e `staging`; `config -q` OK |
| Checkout | `/root/projects/deskcomm-staging` movido de `40c6faec7` para `877d31613` (detached) |
| Execução | `up -d --no-deps app worker scheduler` com `-p deskcomm-staging` |
| Saúde | os três `healthy`, 0 reinícios; `APP_VERSION=877d316` nos três; `/` 200, `/app` 307, `/api/v1/health` 200; `/docs/changelog` 200 sem login, no contêiner e em `https://staging.deskcomm.axisaceleradora.com.br` |

Prova pela tela (Chromium via Playwright, sem login, 1440×900 e 400×800; medidas por `getComputedStyle`, contagem de
elementos e captura de console/HTTP; evidência em `evidence/staging-changelog-1110/`, dados brutos em `resultado.json`):

| Medida | Desktop (1440) | Celular (400) |
|---|---|---|
| Status e URL final | 200, sem redirecionamento | 200, sem redirecionamento |
| Título da aba e `h1` | `Changelog · Axis CRM` / `Changelog` | idem |
| Períodos (`h2`) | Novembro, Fim de outubro, Meio de outubro, Início de outubro | idem |
| Itens | 25 (14 `novo`, 9 `corrigido`, 2 `interface`) | idem |
| Rolagem horizontal | não (`scrollWidth` 1440 = `clientWidth` 1440) | não (400 = 400) |
| Erros de console / respostas ≥ 400 | 0 / 0 | 0 / 0 |

Capturas: `evidence/staging-changelog-1110/changelog-desktop.png` e `changelog-celular.png`. No HTML servido, o texto visível
não traz `github.com`, `digest`, `rollback`, `upstream`, `WAHA` nem número de PR (`#123`); o que casa com `#` e `staging` no
documento bruto são cores CSS em hexadecimal e a URL pública do staging dentro de `window.__PUBLIC_ENV__`.

O que **não** foi provado:

- A versão em espanhol: só se mediu que a rota responde 200 com o cookie `NEXT_LOCALE=es`; o texto não foi conferido na tela
  (o teste unitário cobre os rótulos, e o dicionário não foi revisado por falante nativo).
- O tema escuro da página.
- A produção: ela ainda não serve `/docs/changelog`. Promover é um passo à parte.
- Os demais fluxos do staging (inbox, CRM, envio pelo WhatsApp): esta mudança não os toca e não foram re-provados.

**Para voltar o staging:** apagar `docker-compose.staging-ci.yml` e subir `app worker scheduler` sem ele, ou apontar o
override para as imagens `deskcomm-*:staging-pre-changelog-1110` (ou restaurar `docker-compose.staging-ci.yml.bak-20261110`).
Como não há schema novo, o dump só é necessário se algo fora desta release tiver escrito no banco.

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
