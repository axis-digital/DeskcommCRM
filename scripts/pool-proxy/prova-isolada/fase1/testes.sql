-- Testes da Fase 1. Rodam com ON_ERROR_STOP: a primeira asserção que falha aborta.
-- Cada bloco imprime "OK  <nome>" via NOTICE.
\set ON_ERROR_STOP on
SET client_min_messages = notice;

CREATE FUNCTION pg_temp.t(nome text, cond boolean, detalhe text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA: % %', nome, detalhe;
  END IF;
  RAISE NOTICE 'OK   %', nome;
END $$;

-- Executa um comando que DEVE falhar com o SQLSTATE dado.
CREATE FUNCTION pg_temp.deve_falhar(nome text, sql text, sqlstate_esperado text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = sqlstate_esperado THEN
      RAISE NOTICE 'OK   % (sqlstate %)', nome, SQLSTATE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FALHA: % — esperava %, veio % (%)', nome, sqlstate_esperado, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHA: % — não falhou', nome;
END $$;

-- ---------- migração: efeitos sobre dados legados ----------
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.t('legado atribuído virou incerto/principal',
    (SELECT count(*) FROM public.waha_proxy_pool
      WHERE status='atribuido' AND reserva_estado='incerto' AND instance='principal'
        AND estado_motivo='legado_nao_verificado') = 3);
  PERFORM pg_temp.t('linhas livres/inválidas sem estado',
    (SELECT count(*) FROM public.waha_proxy_pool
      WHERE status<>'atribuido' AND (reserva_estado IS NOT NULL OR instance IS NOT NULL)) = 0);
END $$;

-- ---------- reserva por identidade ----------
DO $$
DECLARE r record; r2 record; op1 uuid := gen_random_uuid(); op2 uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM public.reservar_proxy_waha_v2('principal', 'n-1', op1);
  PERFORM pg_temp.t('reserva nova: estado reservado, não reutilizado',
    r.proxy_id IS NOT NULL AND r.estado='reservado' AND r.reutilizado=false, r::text);
  PERFORM pg_temp.t('linha ficou atribuída com operação e lease',
    (SELECT status='atribuido' AND operation_id=op1 AND lease_expires_at > now()
       AND instance='principal' AND assigned_session='n-1'
       FROM public.waha_proxy_pool WHERE id=r.proxy_id));

  SELECT * INTO r2 FROM public.reservar_proxy_waha_v2('principal', 'n-1', op2);
  PERFORM pg_temp.t('repetição da identidade devolve a mesma linha',
    r2.proxy_id=r.proxy_id AND r2.reutilizado=true AND r2.estado='reservado', r2::text);
  PERFORM pg_temp.t('repetição não troca a operação dona',
    (SELECT operation_id FROM public.waha_proxy_pool WHERE id=r.proxy_id)=op1);
END $$;

SELECT pg_temp.deve_falhar('mesma sessão em outra instância é recusada',
  $$SELECT * FROM public.reservar_proxy_waha_v2('outra', 'n-1', gen_random_uuid())$$, '23514');
SELECT pg_temp.deve_falhar('nome com 55 caracteres é recusado',
  $$SELECT * FROM public.reservar_proxy_waha_v2('principal', repeat('x',55), gen_random_uuid())$$, '22023');
SELECT pg_temp.deve_falhar('lease fora da faixa é recusado',
  $$SELECT * FROM public.reservar_proxy_waha_v2('principal', 'n-x', gen_random_uuid(), 5)$$, '22023');

-- ---------- transições ----------
DO $$
DECLARE id1 int; opx uuid := gen_random_uuid(); opy uuid := gen_random_uuid();
BEGIN
  SELECT proxy_id INTO id1 FROM public.reservar_proxy_waha_v2('principal', 'n-2', opx);
  PERFORM pg_temp.t('outra operação não age em reservado vivo',
    public.transicionar_reserva_waha(id1, opy, 'aplicando') = 'operacao_divergente');
  PERFORM pg_temp.t('reservado -> confirmado é inválido (pula o PUT)',
    public.transicionar_reserva_waha(id1, opx, 'confirmado') = 'transicao_invalida');
  PERFORM pg_temp.t('reservado -> aplicando',
    public.transicionar_reserva_waha(id1, opx, 'aplicando') = 'ok');
  PERFORM pg_temp.t('aplicando -> confirmado',
    public.transicionar_reserva_waha(id1, opx, 'confirmado') = 'ok');
  PERFORM pg_temp.t('confirmado sem lease',
    (SELECT lease_expires_at IS NULL AND reserva_estado='confirmado'
       FROM public.waha_proxy_pool WHERE id=id1));
  PERFORM pg_temp.t('confirmado -> aplicando é inválido',
    public.transicionar_reserva_waha(id1, opx, 'aplicando') = 'transicao_invalida');
  PERFORM pg_temp.t('confirmado -> incerto (watchdog achou divergência)',
    public.transicionar_reserva_waha(id1, opy, 'incerto', 'watchdog') = 'ok');
  PERFORM pg_temp.t('incerto: outra operação reconcilia e vira dona',
    public.transicionar_reserva_waha(id1, opy, 'confirmado', 'releitura_ok') = 'ok'
    AND (SELECT operation_id FROM public.waha_proxy_pool WHERE id=id1) = opy);
  PERFORM pg_temp.t('proxy livre não aceita transição',
    public.transicionar_reserva_waha((SELECT id FROM public.waha_proxy_pool WHERE status='livre' LIMIT 1),
                                     opx, 'aplicando') = 'ausente');
  PERFORM pg_temp.t('quarentena só sai para incerto',
    public.transicionar_reserva_waha(id1, opy, 'quarentena', 'divergencia') = 'ok'
    AND public.transicionar_reserva_waha(id1, opy, 'confirmado') = 'transicao_invalida'
    AND public.transicionar_reserva_waha(id1, opy, 'incerto', 'revisado') = 'ok');
END $$;

-- ---------- lease vencido nunca libera ----------
DO $$
DECLARE id1 int; r record; livres_antes int; livres_depois int; n int;
BEGIN
  SELECT proxy_id INTO id1 FROM public.reservar_proxy_waha_v2('principal', 'n-3', gen_random_uuid());
  UPDATE public.waha_proxy_pool SET lease_expires_at = now() - interval '1 second' WHERE id = id1;
  SELECT count(*) INTO livres_antes FROM public.waha_proxy_pool WHERE status='livre';

  SELECT * INTO r FROM public.reservar_proxy_waha_v2('principal', 'n-3', gen_random_uuid());
  PERFORM pg_temp.t('lease vencido: repetir devolve a mesma linha como incerto',
    r.proxy_id=id1 AND r.estado='incerto' AND r.reutilizado=true, r::text);

  -- outra linha com lease vencido, só para a varredura
  SELECT proxy_id INTO id1 FROM public.reservar_proxy_waha_v2('principal', 'n-4', gen_random_uuid());
  UPDATE public.waha_proxy_pool SET reserva_estado='aplicando', lease_expires_at = now() - interval '1 second' WHERE id = id1;
  n := public.expirar_leases_waha();
  SELECT count(*) INTO livres_depois FROM public.waha_proxy_pool WHERE status='livre';
  PERFORM pg_temp.t('expirar_leases move aplicando vencido para incerto', n = 1
    AND (SELECT reserva_estado FROM public.waha_proxy_pool WHERE id=id1)='incerto');
  PERFORM pg_temp.t('expirar_leases não devolve nada ao pool',
    livres_depois = livres_antes - 1, format('antes=%s depois=%s', livres_antes, livres_depois));
  PERFORM pg_temp.t('transição com lease vencido parte de incerto',
    (SELECT lease_expires_at IS NULL FROM public.waha_proxy_pool WHERE id=id1));
END $$;

-- ---------- liberação ----------
DO $$
DECLARE id1 int; op uuid := gen_random_uuid();
BEGIN
  SELECT proxy_id INTO id1 FROM public.reservar_proxy_waha_v2('principal', 'n-5', op);
  PERFORM pg_temp.t('liberar sem ausência confirmada é recusado',
    public.liberar_proxy_waha(id1, 'teste', false) = 'ausencia_nao_confirmada'
    AND public.liberar_proxy_waha(id1, 'teste', NULL) = 'ausencia_nao_confirmada');
  PERFORM pg_temp.t('liberar durante operação viva é recusado',
    public.liberar_proxy_waha(id1, 'teste', true) = 'operacao_em_andamento');
  PERFORM pg_temp.t('após incerto, liberar com ausência confirmada funciona',
    public.transicionar_reserva_waha(id1, op, 'incerto', 'timeout') = 'ok'
    AND public.liberar_proxy_waha(id1, 'ausencia_confirmada', true) = 'liberado');
  PERFORM pg_temp.t('linha voltou limpa ao pool',
    (SELECT status='livre' AND assigned_session IS NULL AND reserva_estado IS NULL
        AND instance IS NULL AND operation_id IS NULL FROM public.waha_proxy_pool WHERE id=id1));
  PERFORM pg_temp.t('liberar de novo -> ausente', public.liberar_proxy_waha(id1, 'x', true) = 'ausente');
END $$;

-- ---------- escritor legado + guarda ----------
DO $$
DECLARE id1 int;
BEGIN
  PERFORM public.reservar_proxy_waha('leg-x');   -- função do protótipo v1
  SELECT id INTO id1 FROM public.waha_proxy_pool WHERE assigned_session='leg-x';
  PERFORM pg_temp.t('escritor v1 cai em incerto/escritor_legado, sem quebrar',
    (SELECT reserva_estado='incerto' AND estado_motivo='escritor_legado' AND instance='principal'
       FROM public.waha_proxy_pool WHERE id=id1));
  PERFORM pg_temp.t('v2 enxerga a reserva do v1 pela identidade',
    (SELECT proxy_id FROM public.reservar_proxy_waha_v2('principal','leg-x', gen_random_uuid())) = id1);
  -- guarda DESLIGADA (padrão): liberação legada passa e limpa o estado
  UPDATE public.waha_proxy_pool SET status='livre', assigned_session=NULL WHERE id=id1;
  PERFORM pg_temp.t('guarda desligada: liberação legada passa e limpa estado',
    (SELECT status='livre' AND reserva_estado IS NULL AND instance IS NULL
       FROM public.waha_proxy_pool WHERE id=id1));
END $$;

UPDATE public.waha_proxy_pool_guarda SET ativa = true;
SELECT pg_temp.deve_falhar('guarda ligada: liberação direta é recusada',
  $$UPDATE public.waha_proxy_pool SET status='livre', assigned_session=NULL WHERE assigned_session='leg-a'$$, '55006');
SELECT pg_temp.deve_falhar('guarda ligada: troca de sessão da linha é recusada',
  $$UPDATE public.waha_proxy_pool SET assigned_session='roubada' WHERE assigned_session='leg-a'$$, '55006');
DO $$
DECLARE id1 int;
BEGIN
  SELECT id INTO id1 FROM public.waha_proxy_pool WHERE assigned_session='leg-a';
  PERFORM pg_temp.t('guarda ligada: liberar_proxy_waha continua funcionando',
    public.liberar_proxy_waha(id1, 'ausencia_confirmada', true) = 'liberado');
  PERFORM pg_temp.t('guarda ligada: atribuição nova e update neutro continuam livres',
    (SELECT proxy_id FROM public.reservar_proxy_waha_v2('principal','n-6', gen_random_uuid())) IS NOT NULL);
  UPDATE public.waha_proxy_pool SET updated_at = now() WHERE assigned_session='leg-b';
  RAISE NOTICE 'OK   guarda ligada: update que não perde atribuição passa';
  PERFORM pg_temp.t('flag de autorização não vaza para fora da função',
    COALESCE(current_setting('waha_pool.liberacao_autorizada', true), '') <> 'sim');
END $$;
UPDATE public.waha_proxy_pool_guarda SET ativa = false;

-- ---------- registrar proxy existente ----------
-- Massa limpa: devolve ao pool o que os blocos anteriores usaram (guarda desligada).
UPDATE public.waha_proxy_pool SET status='livre', assigned_session=NULL
 WHERE status='atribuido' AND assigned_session LIKE 'n-%';
DO $$
DECLARE livre int; opx uuid := gen_random_uuid(); outro int; res text;
BEGIN
  SELECT id INTO livre FROM public.waha_proxy_pool WHERE status='livre' ORDER BY id LIMIT 1;
  SELECT id INTO outro FROM public.waha_proxy_pool WHERE status='livre' AND id<>livre ORDER BY id LIMIT 1;
  res := public.registrar_proxy_existente_waha('principal','reg-1',livre,opx);
  PERFORM pg_temp.t('registrar proxy livre -> registrado/confirmado',
    res='registrado'
    AND (SELECT reserva_estado='confirmado' AND operation_id=opx AND lease_expires_at IS NULL
           FROM public.waha_proxy_pool WHERE id=livre), res);
  PERFORM pg_temp.t('registrar de novo -> ja_registrado',
    public.registrar_proxy_existente_waha('principal','reg-1',livre,opx)='ja_registrado');
  PERFORM pg_temp.t('mesmo proxy para outra sessão -> conflito_proxy',
    public.registrar_proxy_existente_waha('principal','reg-2',livre,opx)='conflito_proxy');
  PERFORM pg_temp.t('mesma sessão com outro proxy -> conflito_sessao',
    public.registrar_proxy_existente_waha('principal','reg-1',outro,opx)='conflito_sessao');
  PERFORM pg_temp.t('proxy inexistente -> proxy_ausente',
    public.registrar_proxy_existente_waha('principal','reg-3',999999,opx)='proxy_ausente');
END $$;

-- ---------- pool: inválido nunca é reservado; esgotamento ----------
DO $$
DECLARE r record; i int := 0;
BEGIN
  LOOP
    SELECT * INTO r FROM public.reservar_proxy_waha_v2('principal', 'ex-'||i, gen_random_uuid());
    EXIT WHEN r.proxy_id IS NULL;
    i := i + 1;
    EXIT WHEN i > 50;
  END LOOP;
  PERFORM pg_temp.t('pool esgota com proxy_id NULL, sem exceção', i < 50, 'reservas feitas: '||i);
  PERFORM pg_temp.t('linha inválida nunca foi atribuída',
    (SELECT status='invalido' AND assigned_session IS NULL FROM public.waha_proxy_pool WHERE proxy_address='p4.invalid'));
  PERFORM pg_temp.t('nenhuma sessão em duas linhas',
    (SELECT count(*) FROM (SELECT assigned_session FROM public.waha_proxy_pool
                            WHERE status='atribuido' GROUP BY 1 HAVING count(*)>1) d) = 0);
END $$;

\echo TESTES SQL OK
