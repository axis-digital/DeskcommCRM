-- PROTÓTIPO PARA BANCO ISOLADO: NÃO APLICAR no banco externo de produção.
-- O índice só garante uma reserva por nome quando todos os escritores usam
-- o mesmo pool/namespace. Outros writers ainda podem modificar ou liberar uma
-- linha após o commit; por isso este artefato NÃO é proteção suficiente para
-- os workflows existentes e requer reconciliação antes de qualquer rollout.
CREATE UNIQUE INDEX IF NOT EXISTS waha_proxy_pool_atribuicao_unica_v1
  ON public.waha_proxy_pool (assigned_session)
  WHERE status = 'atribuido' AND assigned_session IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reservar_proxy_waha(p_sessao text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id integer;
  v_valido boolean;
BEGIN
  IF p_sessao IS NULL OR btrim(p_sessao) = '' OR length(p_sessao) > 54 THEN
    RAISE EXCEPTION 'nome de sessão inválido' USING ERRCODE = '22023';
  END IF;

  -- Uma segunda chamada para o mesmo nome espera a primeira transação terminar.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sessao, 0));
  SELECT id, valid INTO v_id, v_valido FROM public.waha_proxy_pool
    WHERE status = 'atribuido' AND assigned_session = p_sessao;
  IF v_id IS NOT NULL THEN
    IF NOT v_valido THEN
      RAISE EXCEPTION 'proxy atribuído inválido; exige reconciliação' USING ERRCODE = '23514';
    END IF;
    RETURN v_id;
  END IF;

  SELECT id INTO v_id FROM public.waha_proxy_pool
    WHERE status = 'livre' AND assigned_session IS NULL AND valid = true
    ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.waha_proxy_pool
    SET status = 'atribuido', assigned_session = p_sessao,
        assigned_at = now(), updated_at = now()
    WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reservar_proxy_waha(text) FROM PUBLIC;
-- A concessão ao papel operacional específico deve ser definida na implantação.

-- Pré-condição externa: inventário completo confirmou que o endereço do ID
-- pertence a uma só sessão e que a fotografia ainda é válida. Esta função não
-- consulta WAHA e não consegue detectar compartilhamento fora do banco.
CREATE OR REPLACE FUNCTION public.registrar_proxy_existente_waha(p_sessao text, p_proxy_id integer)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_atual public.waha_proxy_pool%ROWTYPE;
BEGIN
  IF p_sessao IS NULL OR btrim(p_sessao) = '' OR length(p_sessao) > 54 OR p_proxy_id IS NULL THEN
    RAISE EXCEPTION 'identidade inválida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sessao, 0));
  SELECT * INTO v_atual FROM public.waha_proxy_pool WHERE id = p_proxy_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'proxy_ausente'; END IF;
  IF v_atual.status = 'atribuido' AND v_atual.assigned_session = p_sessao THEN
    RETURN 'ja_registrado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.waha_proxy_pool WHERE status = 'atribuido' AND assigned_session = p_sessao AND id <> p_proxy_id) THEN
    RETURN 'conflito_sessao';
  END IF;
  IF v_atual.status <> 'livre' OR v_atual.assigned_session IS NOT NULL THEN
    RETURN 'conflito_proxy';
  END IF;
  -- Um proxy inválido mas ainda usado não pode ficar disponível. O cadastro
  -- preserva o indicador valid=false e obriga tratamento operacional.
  UPDATE public.waha_proxy_pool SET status = 'atribuido', assigned_session = p_sessao,
    assigned_at = now(), updated_at = now() WHERE id = p_proxy_id;
  RETURN 'registrado';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registrar_proxy_existente_waha(text, integer) FROM PUBLIC;
