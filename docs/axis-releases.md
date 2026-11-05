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

Nada disto atualiza produção sozinho; cada passo é uma decisão humana. **Não foi exercitado em produção**
até este registro; o primeiro uso deve ser anotado na tabela abaixo.

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

## Staging

O staging deve rodar a mesma release que se pretende promover. Em 2026-11-05 ele estava em `a3019b912`
(PR #37), com imagens construídas no host e o scheduler na imagem do upstream `1.74.0`, isto é, **fora da
linha de produção**. Medir com os mesmos comandos de "Como conferir", trocando `deskcommcrm-*` por
`deskcomm-staging-*`.
