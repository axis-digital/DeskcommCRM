#!/usr/bin/env bash
# Fork Axis — traz a main do upstream (melgarafael/DeskcommCRM) para uma branch
# merge/upstream-AAAA-MM-DD criada a partir de origin/main (a produção do fork).
# Não mescla em main, não faz push de main, não faz deploy: o merge entra por PR no
# fork (base main), como manda o CLAUDE.md. Ver docs/axis-fork.md.
#
# Uso:
#   scripts/axis-sync-upstream.sh               # branch merge/upstream-AAAA-MM-DD + merge + gates
#   scripts/axis-sync-upstream.sh --sem-testes  # pula typecheck/test:unit (só o merge)
#
# Antes de mesclar, leia o que mudou: https://www.deskcomm.com.br/changelog
set -euo pipefail

UPSTREAM_REMOTE="upstream"
FORK_REMOTE="origin"
BASE="$FORK_REMOTE/main"
RODAR_TESTES=1

for arg in "$@"; do
  case "$arg" in
    --push-main)
      echo "ERRO: --push-main foi removido. Ele empurrava $UPSTREAM_REMOTE/main para a main do fork, que é a produção;" >&2
      echo "      push direto na main está bloqueado e o upstream entra por PR (branch merge/upstream-AAAA-MM-DD)." >&2
      exit 2 ;;
    --sem-testes) RODAR_TESTES=0 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

# 1. Árvore limpa: merge só entra em árvore limpa (CLAUDE.md, higiene de branches).
if [ -n "$(git status --porcelain)" ]; then
  echo "ERRO: working tree sujo. Comite ou guarde as mudanças antes do sync." >&2
  git status --short >&2
  exit 1
fi

git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1 || {
  echo "ERRO: remote '$UPSTREAM_REMOTE' não existe. git remote add upstream https://github.com/melgarafael/DeskcommCRM.git" >&2
  exit 1
}

# 2. Buscar o upstream (com tags, para saber a versão).
git fetch "$UPSTREAM_REMOTE" --tags
git fetch "$FORK_REMOTE"

read -r FRENTE ATRAS < <(git rev-list --left-right --count "$BASE...$UPSTREAM_REMOTE/main")
VERSAO="$(git tag --merged "$UPSTREAM_REMOTE/main" --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)"
echo "==> $BASE: $FRENTE commits à frente, $ATRAS atrás de $UPSTREAM_REMOTE/main (versão mais nova: ${VERSAO:-desconhecida})"
echo "    Leia o que mudou antes de mesclar: https://www.deskcomm.com.br/changelog"

if [ "$ATRAS" = "0" ]; then
  echo "==> nada a trazer: $BASE já contém $UPSTREAM_REMOTE/main."
  exit 0
fi

# 3. Branch de merge a partir de origin/main (sem rastrear a main: nada daqui sobe para ela).
BRANCH="merge/upstream-$(date +%F)"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "ERRO: a branch $BRANCH já existe. Apague-a ou continue nela à mão." >&2
  exit 1
fi
git switch -c "$BRANCH" --no-track "$BASE"

# 5. Merge (nunca rebase/reset/force).
if ! git merge --no-ff --no-edit -m "merge: upstream/main $(date +%F) (${VERSAO:-sem tag})" "$UPSTREAM_REMOTE/main"; then
  echo
  echo "==> CONFLITO. Arquivos para resolver:"
  git diff --name-only --diff-filter=U | sed 's/^/    /'
  cat <<'EOF'

Pontos do fork que costumam conflitar (detalhes em docs/axis-fork.md):
  - app/layout.tsx: import de ./axis-theme.css + 3 fontes --font-axis-* + preload:false nas antigas
  - supabase/baseline.sql: o apêndice da migration 0900 fica ANTES do bloco
    "-- ---- VARREDURA anon:" (nenhuma função pode ser criada depois dele)
  - supabase/migrations/MANIFEST.md: manter a linha da 0900
  - lib/waha/client.ts: configDeCriacao() (webhook por sessão + WAHA_SESSION_PROXY),
    listagem de chats/mensagens
  - lib/waha/ingest.ts: export dos helpers + registrarStatusParaHistorico em handleSessionStatus
  - hostgator-setup-kit/_common.sh e install.sh: COMPOSE_EXTRA_FILES em dc()/dc_files()
  - Se o upstream recriou trg_messages_emit_event, trg_demanda_abre_no_inbound ou
    trg_reply_inbound_revision: reaplicar o WHEN da 0900 (pnpm test:db pega a regressão)

Resolva preservando os dois lados, `git add` e `git commit`. Depois rode
pnpm typecheck && pnpm test:unit (e pnpm test:db se tocou schema).
EOF
  exit 1
fi

# 6. Tokens novos do tema: o fork redefine tokens em app/axis-theme.css.
if ! git diff --quiet ORIG_HEAD HEAD -- app/globals.css; then
  echo "==> ATENÇÃO: app/globals.css mudou. Se houver token novo, defina o valor Axis em"
  echo "    app/axis-theme.css nos DOIS temas:  git diff ORIG_HEAD HEAD -- app/globals.css"
fi
NOVAS_MIGRATIONS="$(git diff --name-only --diff-filter=A ORIG_HEAD HEAD -- supabase/migrations/ | grep -c '\.sql$' || true)"
echo "==> migrations novas do upstream: $NOVAS_MIGRATIONS (chegam ao banco pelo baseline.sql no update)"

# 7. Gates.
if [ "$RODAR_TESTES" = "1" ]; then
  pnpm install --frozen-lockfile
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"
  pnpm typecheck
  LOG="$(mktemp -t axis-sync-vitest.XXXXXX.log)"
  set +e
  pnpm test:unit >"$LOG" 2>&1
  CODIGO=$?
  set -e
  echo "==> test:unit exit=$CODIGO (log em $LOG)"
  grep -aE '^ *(Test Files|Tests|Errors) ' "$LOG" | tail -3 || true
  grep -aE '^ *FAIL ' "$LOG" | sed 's/ > .*//' | sort | uniq -c || true
  if [ "$CODIGO" != "0" ]; then
    echo "    Falha conhecida e alheia ao fork: tests/unit/pdf-extractor.test.ts (tsx --eval)."
    echo "    Qualquer outra: compare rodando o mesmo arquivo em upstream/main antes de mesclar."
  fi
fi

cat <<EOF

==> Próximos passos (manuais, depois de revisar):
    pnpm test:db                       # se o upstream trouxe migration (CONFERENCIA_KIT_RELEASE=${VERSAO:-vX.Y.Z} sem rede)
    git push -u $FORK_REMOTE $BRANCH
    gh pr create -R axis-digital/DeskcommCRM --base main --head $BRANCH   # SEMPRE com -R: sem ele o gh pode escolher o upstream
    # ANTES de qualquer deploy: dump lógico do banco de produção + restore de ensaio (docs/axis-fork.md, "Antes de atualizar a produção")
    # depois do merge do PR: rebuild das imagens :axis (app, worker — o scheduler segue a imagem publicada do upstream) e deploy com docker-compose.axis.yml
EOF
