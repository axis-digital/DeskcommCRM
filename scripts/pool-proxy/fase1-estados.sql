-- FASE 1 — ESTADOS DE RESERVA DO POOL DE PROXY WAHA.
-- PROTÓTIPO PARA BANCO ISOLADO: NÃO APLICAR no banco externo de produção sem o
-- inventário da Fase 0, backup e plano de retorno (ver plano 2026-10-30).
--
-- Migração ADITIVA e idempotente, aplicada sobre `reserva-atomica.sql`:
--   * `status` (livre/atribuido/invalido) continua existindo e significando o mesmo
--     para os workflows atuais. Os estados novos ficam em `reserva_estado`, que só
--     existe enquanto `status = 'atribuido'`.
--   * Uma linha em qualquer `reserva_estado` continua `atribuido`: nenhum estado novo
--     devolve o proxy ao pool. Só `liberar_proxy_waha` libera, e só com ausência
--     confirmada.
--   * Escritor legado que atribui uma linha sem informar estado cai em `incerto`
--     (honesto: ninguém verificou o WAHA). Isso nunca quebra o escritor.
--   * A guarda de liberação (`waha_proxy_pool_guarda.ativa`) nasce DESLIGADA. Ligá-la
--     faz o banco recusar liberação/troca de atribuição que não venha de
--     `liberar_proxy_waha`: é o passo que "trava" os workflows antigos, e por isso é
--     decisão de rollout, não da migração. Protege contra acidente de workflow, não
--     contra quem tem acesso de superusuário; a fronteira real são os GRANTs.
--
-- Estados:
--   reservado  linha separada para a identidade; PUT ainda não enviado (lease curto)
--   aplicando  PUT enviado, confirmação pendente (lease curto)
--   confirmado GET posterior confirmou o proxy naquela sessão
--   incerto    PUT pode ter sido aplicado; exige reler o WAHA. Nunca libera sozinho
--   quarentena divergência/conflito; exige decisão humana
--
-- Lease expirado em reservado/aplicando vira `incerto`, nunca `livre`.

ALTER TABLE public.waha_proxy_pool
  ADD COLUMN IF NOT EXISTS instance text,
  ADD COLUMN IF NOT EXISTS reserva_estado text,
  ADD COLUMN IF NOT EXISTS operation_id uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS estado_motivo text,
  ADD COLUMN IF NOT EXISTS estado_em timestamptz;

-- Auto-cura ANTES das constraints (o update de um banco antigo não pode quebrar).
-- Atribuição existente que ninguém verificou é `incerto`, não `confirmado`.
UPDATE public.waha_proxy_pool
   SET instance = COALESCE(instance, 'principal'),
       reserva_estado = COALESCE(reserva_estado, 'incerto'),
       estado_motivo = CASE WHEN reserva_estado IS NULL THEN 'legado_nao_verificado' ELSE estado_motivo END,
       estado_em = COALESCE(estado_em, now())
 WHERE status = 'atribuido' AND (instance IS NULL OR reserva_estado IS NULL);

UPDATE public.waha_proxy_pool
   SET reserva_estado = NULL, operation_id = NULL, lease_expires_at = NULL,
       estado_motivo = NULL, instance = NULL
 WHERE status <> 'atribuido'
   AND (reserva_estado IS NOT NULL OR operation_id IS NOT NULL OR lease_expires_at IS NOT NULL
        OR instance IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waha_proxy_pool_reserva_estado_check') THEN
    ALTER TABLE public.waha_proxy_pool ADD CONSTRAINT waha_proxy_pool_reserva_estado_check
      CHECK (reserva_estado IS NULL
             OR reserva_estado IN ('reservado', 'aplicando', 'confirmado', 'incerto', 'quarentena'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waha_proxy_pool_estado_so_se_atribuido') THEN
    ALTER TABLE public.waha_proxy_pool ADD CONSTRAINT waha_proxy_pool_estado_so_se_atribuido
      CHECK ((status = 'atribuido') = (reserva_estado IS NOT NULL AND instance IS NOT NULL));
  END IF;
END $$;

-- A identidade é (instância, sessão). O índice global por `assigned_session` (do
-- protótipo v1) segue valendo e é mais estrito: o mesmo nome em duas instâncias
-- continua recusado até a decisão de multi-instância.
CREATE UNIQUE INDEX IF NOT EXISTS waha_proxy_pool_identidade_unica_v1
  ON public.waha_proxy_pool (instance, assigned_session)
  WHERE status = 'atribuido' AND assigned_session IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.waha_proxy_pool_guarda (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ativa boolean NOT NULL DEFAULT false
);
INSERT INTO public.waha_proxy_pool_guarda (id, ativa) VALUES (true, false) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.waha_proxy_pool_estado_trg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_perde_atribuicao boolean := false;
  v_guarda boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'atribuido' THEN
    v_perde_atribuicao := NEW.status <> 'atribuido'
      OR NEW.assigned_session IS DISTINCT FROM OLD.assigned_session;
  END IF;

  IF v_perde_atribuicao THEN
    SELECT ativa INTO v_guarda FROM public.waha_proxy_pool_guarda LIMIT 1;
    IF COALESCE(v_guarda, false)
       AND COALESCE(current_setting('waha_pool.liberacao_autorizada', true), '') <> 'sim' THEN
      RAISE EXCEPTION 'liberação ou troca de atribuição do proxy % só por liberar_proxy_waha', OLD.id
        USING ERRCODE = '55006';
    END IF;
  END IF;

  IF NEW.status = 'atribuido' THEN
    IF NEW.reserva_estado IS NULL THEN
      NEW.reserva_estado := 'incerto';
      NEW.estado_motivo := 'escritor_legado';
      NEW.estado_em := now();
      NEW.operation_id := NULL;
      NEW.lease_expires_at := NULL;
    END IF;
    IF NEW.instance IS NULL THEN NEW.instance := 'principal'; END IF;
  ELSE
    NEW.reserva_estado := NULL;
    NEW.operation_id := NULL;
    NEW.lease_expires_at := NULL;
    NEW.estado_motivo := NULL;
    NEW.instance := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waha_proxy_pool_estado ON public.waha_proxy_pool;
CREATE TRIGGER waha_proxy_pool_estado
  BEFORE INSERT OR UPDATE ON public.waha_proxy_pool
  FOR EACH ROW EXECUTE FUNCTION public.waha_proxy_pool_estado_trg();

-- Reserva por identidade. Esgotado: devolve proxy_id NULL.
-- Repetição da mesma identidade devolve a mesma linha (reutilizado = true), com o
-- estado atual: quem chama decide o que fazer com `incerto`/`quarentena`.
CREATE OR REPLACE FUNCTION public.reservar_proxy_waha_v2(
  p_instancia text, p_sessao text, p_operacao uuid, p_lease_s integer DEFAULT 120)
RETURNS TABLE (proxy_id integer, estado text, reutilizado boolean)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.waha_proxy_pool%ROWTYPE;
  v_id integer;
BEGIN
  IF p_instancia IS NULL OR btrim(p_instancia) = '' OR length(p_instancia) > 64
     OR p_sessao IS NULL OR btrim(p_sessao) = '' OR length(p_sessao) > 54
     OR p_operacao IS NULL OR p_lease_s IS NULL OR p_lease_s NOT BETWEEN 10 AND 900 THEN
    RAISE EXCEPTION 'identidade ou operação inválida' USING ERRCODE = '22023';
  END IF;

  -- Mesma chave de bloqueio do protótipo v1: v1 e v2 se serializam por sessão.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sessao, 0));

  SELECT * INTO v FROM public.waha_proxy_pool
    WHERE status = 'atribuido' AND assigned_session = p_sessao;
  IF FOUND THEN
    IF v.instance IS DISTINCT FROM p_instancia THEN
      RAISE EXCEPTION 'sessão pertence a outra instância' USING ERRCODE = '23514';
    END IF;
    IF NOT v.valid THEN
      RAISE EXCEPTION 'proxy atribuído inválido; exige reconciliação' USING ERRCODE = '23514';
    END IF;
    IF v.reserva_estado IN ('reservado', 'aplicando') AND v.lease_expires_at <= now() THEN
      UPDATE public.waha_proxy_pool
         SET reserva_estado = 'incerto', estado_motivo = 'lease_expirado',
             estado_em = now(), lease_expires_at = NULL, updated_at = now()
       WHERE id = v.id;
      v.reserva_estado := 'incerto';
    END IF;
    RETURN QUERY SELECT v.id, v.reserva_estado, true;
    RETURN;
  END IF;

  SELECT p.id INTO v_id FROM public.waha_proxy_pool p
    WHERE p.status = 'livre' AND p.assigned_session IS NULL AND p.valid = true
    ORDER BY p.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN
    RETURN QUERY SELECT NULL::integer, NULL::text, false;
    RETURN;
  END IF;

  UPDATE public.waha_proxy_pool
     SET status = 'atribuido', assigned_session = p_sessao, assigned_at = now(),
         updated_at = now(), instance = p_instancia, reserva_estado = 'reservado',
         operation_id = p_operacao, lease_expires_at = now() + make_interval(secs => p_lease_s),
         estado_motivo = NULL, estado_em = now()
   WHERE id = v_id;
  RETURN QUERY SELECT v_id, 'reservado'::text, false;
END;
$$;

-- Transições permitidas. Em `reservado`/`aplicando` (lease vivo) só a operação dona
-- age; em `incerto`/`quarentena`/`confirmado` qualquer operação pode reconciliar, e
-- passa a ser a dona. Lease vencido conta como `incerto`.
-- Devolve: ok | ausente | operacao_divergente | transicao_invalida.
CREATE OR REPLACE FUNCTION public.transicionar_reserva_waha(
  p_proxy_id integer, p_operacao uuid, p_para text, p_motivo text DEFAULT NULL,
  p_lease_s integer DEFAULT 120)
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.waha_proxy_pool%ROWTYPE;
  v_de text;
BEGIN
  IF p_proxy_id IS NULL OR p_operacao IS NULL OR p_lease_s IS NULL OR p_lease_s NOT BETWEEN 10 AND 900 THEN
    RAISE EXCEPTION 'argumentos inválidos' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.waha_proxy_pool WHERE id = p_proxy_id FOR UPDATE;
  IF NOT FOUND OR v.status <> 'atribuido' THEN RETURN 'ausente'; END IF;

  v_de := v.reserva_estado;
  IF v_de IN ('reservado', 'aplicando') AND v.lease_expires_at <= now() THEN
    v_de := 'incerto';
  END IF;
  IF v_de IN ('reservado', 'aplicando') AND v.operation_id IS DISTINCT FROM p_operacao THEN
    RETURN 'operacao_divergente';
  END IF;

  IF NOT (
    (v_de = 'reservado'  AND p_para IN ('aplicando', 'incerto', 'quarentena')) OR
    (v_de = 'aplicando'  AND p_para IN ('confirmado', 'incerto', 'quarentena')) OR
    (v_de = 'incerto'    AND p_para IN ('aplicando', 'confirmado', 'quarentena')) OR
    (v_de = 'confirmado' AND p_para IN ('incerto', 'quarentena')) OR
    (v_de = 'quarentena' AND p_para IN ('incerto'))
  ) THEN
    RETURN 'transicao_invalida';
  END IF;

  UPDATE public.waha_proxy_pool
     SET reserva_estado = p_para,
         operation_id = p_operacao,
         lease_expires_at = CASE WHEN p_para IN ('reservado', 'aplicando')
                                 THEN now() + make_interval(secs => p_lease_s) ELSE NULL END,
         estado_motivo = p_motivo, estado_em = now(), updated_at = now()
   WHERE id = p_proxy_id;
  RETURN 'ok';
END;
$$;

-- Lease vencido em reservado/aplicando vira `incerto`. NUNCA libera.
CREATE OR REPLACE FUNCTION public.expirar_leases_waha()
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.waha_proxy_pool
     SET reserva_estado = 'incerto', estado_motivo = 'lease_expirado',
         estado_em = now(), lease_expires_at = NULL, updated_at = now()
   WHERE status = 'atribuido' AND reserva_estado IN ('reservado', 'aplicando')
     AND lease_expires_at <= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Único caminho de liberação. Exige ausência confirmada pelo chamador (GET do WAHA
-- mostrando que a sessão não usa o proxy, ou sessão inexistente confirmada) e recusa
-- liberar durante uma operação viva.
-- Devolve: liberado | ausente | ausencia_nao_confirmada | operacao_em_andamento.
CREATE OR REPLACE FUNCTION public.liberar_proxy_waha(
  p_proxy_id integer, p_motivo text, p_ausencia_confirmada boolean)
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.waha_proxy_pool%ROWTYPE;
BEGIN
  IF p_proxy_id IS NULL OR p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'argumentos inválidos' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.waha_proxy_pool WHERE id = p_proxy_id FOR UPDATE;
  IF NOT FOUND OR v.status <> 'atribuido' THEN RETURN 'ausente'; END IF;
  IF p_ausencia_confirmada IS NOT TRUE THEN RETURN 'ausencia_nao_confirmada'; END IF;
  IF v.reserva_estado IN ('reservado', 'aplicando') AND v.lease_expires_at > now() THEN
    RETURN 'operacao_em_andamento';
  END IF;

  PERFORM set_config('waha_pool.liberacao_autorizada', 'sim', true);
  UPDATE public.waha_proxy_pool
     SET status = 'livre', assigned_session = NULL, assigned_at = NULL, updated_at = now()
   WHERE id = p_proxy_id;
  PERFORM set_config('waha_pool.liberacao_autorizada', '', true);
  RETURN 'liberado';
END;
$$;

-- Registro de proxy já presente numa sessão (Fase 0): mesma regra do v1, mas grava
-- instância, estado `confirmado` e operação. Pré-condição externa: o chamador já
-- comparou o endereço com o WAHA.
-- Devolve: registrado | ja_registrado | proxy_ausente | conflito_sessao | conflito_proxy.
CREATE OR REPLACE FUNCTION public.registrar_proxy_existente_waha(
  p_instancia text, p_sessao text, p_proxy_id integer, p_operacao uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_atual public.waha_proxy_pool%ROWTYPE;
BEGIN
  IF p_instancia IS NULL OR btrim(p_instancia) = '' OR length(p_instancia) > 64
     OR p_sessao IS NULL OR btrim(p_sessao) = '' OR length(p_sessao) > 54
     OR p_proxy_id IS NULL OR p_operacao IS NULL THEN
    RAISE EXCEPTION 'identidade inválida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sessao, 0));
  SELECT * INTO v_atual FROM public.waha_proxy_pool WHERE id = p_proxy_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'proxy_ausente'; END IF;
  IF v_atual.status = 'atribuido' AND v_atual.assigned_session = p_sessao THEN
    RETURN 'ja_registrado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.waha_proxy_pool
              WHERE status = 'atribuido' AND assigned_session = p_sessao AND id <> p_proxy_id) THEN
    RETURN 'conflito_sessao';
  END IF;
  IF v_atual.status <> 'livre' OR v_atual.assigned_session IS NOT NULL THEN
    RETURN 'conflito_proxy';
  END IF;
  UPDATE public.waha_proxy_pool
     SET status = 'atribuido', assigned_session = p_sessao, assigned_at = now(),
         updated_at = now(), instance = p_instancia, reserva_estado = 'confirmado',
         operation_id = p_operacao, lease_expires_at = NULL,
         estado_motivo = 'registrado_da_sessao', estado_em = now()
   WHERE id = p_proxy_id;
  RETURN 'registrado';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reservar_proxy_waha_v2(text, text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transicionar_reserva_waha(integer, uuid, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expirar_leases_waha() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.liberar_proxy_waha(integer, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_proxy_existente_waha(text, text, integer, uuid) FROM PUBLIC;
-- As concessões ao papel operacional do n8n são definidas na implantação.
