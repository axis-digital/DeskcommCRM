#!/usr/bin/env bash
# Prova da Fase 1 em Postgres DESCARTÁVEL. Recria o banco `pool_fase1` do container
# `proxytest-pg` a cada execução; não toca `pool_sintetico` nem nada de produção.
# PT_SQL_DIR troca o diretório dos .sql (usado para provar que a prova falha quando
# a proteção é removida de uma cópia).
set -euo pipefail
cd "$(dirname "$0")"
CONT=${PT_PG_CONTAINER:-proxytest-pg}
DB=pool_fase1
SQL=${PT_SQL_DIR:-../../}
RODADAS=${PT_RODADAS:-4}
GATE=777

psql_adm() { docker exec -i "$CONT" psql -U proxytest -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_db()  { docker exec -i "$CONT" psql -U proxytest -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }

echo "== recria $DB"
psql_adm -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"

echo "== esquema legado + protótipo v1"
psql_db < legado.sql
psql_db < "${SQL}reserva-atomica.sql"

echo "== migração da Fase 1 (1ª aplicação, em transação única)"
psql_db -1 < "${SQL}fase1-estados.sql"
echo "== migração da Fase 1 (2ª aplicação: idempotência)"
psql_db -1 < "${SQL}fase1-estados.sql"

echo "== testes SQL"
LOG=$(mktemp)
if psql_db < testes.sql > "$LOG" 2>&1; then RES=0; else RES=$?; fi
grep -E 'OK  |FALHA|ERROR|TESTES' "$LOG" | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR): +//' || true
echo "   asserções OK: $(grep -c 'NOTICE:  OK' "$LOG")"
rm -f "$LOG"
[ "$RES" = 0 ] || { echo "FALHOU (psql=$RES)"; exit 1; }

echo "== concorrência (largada sincronizada, $RODADAS rodadas por cenário)"

# Devolve tudo ao pool e deixa exatamente $1 linhas livres e válidas (guarda desligada).
reset_pool() {
  psql_db -c "UPDATE public.waha_proxy_pool SET status='livre', assigned_session=NULL
                WHERE status='atribuido' OR (status='invalido' AND valid)" >/dev/null
  psql_db -c "UPDATE public.waha_proxy_pool SET status='invalido'
                WHERE status='livre' AND valid AND id NOT IN
                  (SELECT id FROM public.waha_proxy_pool WHERE status='livre' AND valid ORDER BY id LIMIT $1)" >/dev/null
}

# Um controlador segura um lock exclusivo; cada worker abre a conexão e espera num lock
# compartilhado. Quando o controlador solta, todos disparam juntos. Sem isso o custo
# de abrir cada `docker exec` serializa as chamadas e a prova não prova nada.
# $1 = arquivo de saída; demais argumentos = SQL de cada worker. Saída: o valor da
# última consulta, ou ERR se o worker falhou.
largada() {
  local out=$1; shift
  : > "$out"
  docker exec -i "$CONT" psql -U proxytest -d "$DB" -q -At -c \
    "SELECT pg_advisory_lock($GATE); SELECT pg_sleep(3); SELECT pg_advisory_unlock($GATE)" >/dev/null &
  sleep 1
  local sql
  for sql in "$@"; do
    (
      if r=$(docker exec -i "$CONT" psql -U proxytest -d "$DB" -At -v ON_ERROR_STOP=1 \
               -c "SELECT pg_advisory_lock_shared($GATE); $sql" 2>/dev/null); then
        printf '%s\n' "$r" | grep -v '^$' | tail -1 >> "$out"
      else
        echo ERR >> "$out"
      fi
    ) &
  done
  wait
}

OUT=$(mktemp)
FALHOU=0

# Cenário 1: 1 linha livre, 8 sessões DIFERENTES ao mesmo tempo -> exatamente 1 ganha,
# as outras recebem pool esgotado (NULL), e ninguém leva erro.
for r in $(seq 1 "$RODADAS"); do
  reset_pool 1
  args=()
  for i in 1 2 3 4 5 6 7 8; do
    args+=("SELECT coalesce(proxy_id::text,'NULL') FROM public.reservar_proxy_waha_v2('principal','c1-$r-$i',gen_random_uuid())")
  done
  largada "$OUT" "${args[@]}"
  GAN=$(grep -cvE '^(NULL|ERR)$' "$OUT" || true)
  ERRS=$(grep -c '^ERR$' "$OUT" || true)
  LINHAS=$(psql_db -At -c "SELECT count(*) FROM public.waha_proxy_pool WHERE assigned_session LIKE 'c1-$r-%'")
  echo "   [1/$r] ganharam=$GAN (esperado 1) erros=$ERRS (esperado 0) linhas_atribuidas=$LINHAS (esperado 1)"
  [ "$GAN" = 1 ] && [ "$ERRS" = 0 ] && [ "$LINHAS" = 1 ] || FALHOU=1
done

# Cenário 2: a MESMA identidade em 6 chamadas simultâneas, 3 linhas livres -> todas
# recebem o mesmo proxy, sem erro, e a sessão ocupa uma só linha.
for r in $(seq 1 "$RODADAS"); do
  reset_pool 3
  args=()
  for i in 1 2 3 4 5 6; do
    args+=("SELECT proxy_id FROM public.reservar_proxy_waha_v2('principal','c2-$r',gen_random_uuid())")
  done
  largada "$OUT" "${args[@]}"
  ERRS=$(grep -c '^ERR$' "$OUT" || true)
  DISTINTOS=$(grep -v '^ERR$' "$OUT" | sort -u | wc -l)
  LINHAS=$(psql_db -At -c "SELECT count(*) FROM public.waha_proxy_pool WHERE assigned_session='c2-$r'")
  echo "   [2/$r] ids_distintos=$DISTINTOS (esperado 1) erros=$ERRS (esperado 0) linhas=$LINHAS (esperado 1)"
  [ "$DISTINTOS" = 1 ] && [ "$ERRS" = 0 ] && [ "$LINHAS" = 1 ] || FALHOU=1
done
rm -f "$OUT"

[ "$FALHOU" = 0 ] || { echo "FALHA: concorrência"; exit 1; }
echo "== TUDO OK"
