
-- 1) Audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins read audit log"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx ON public.admin_audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON public.admin_audit_log (target_user_id);

-- 2) Rewrite admin_adjust_credits: clean logic + audit log
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(p_target_user uuid, p_delta integer, p_reason text DEFAULT 'admin_adjust'::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_target_user IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  INSERT INTO public.user_credits (user_id, balance)
  VALUES (p_target_user, GREATEST(p_delta, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = GREATEST(0, public.user_credits.balance + p_delta),
        updated_at = now()
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (
    p_target_user,
    p_delta,
    CASE WHEN p_delta > 0 THEN 'admin_topup' ELSE 'admin_debit' END,
    p_reason
  );

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, details)
  VALUES (
    auth.uid(),
    'adjust_credits',
    p_target_user,
    jsonb_build_object('delta', p_delta, 'reason', p_reason, 'new_balance', v_balance)
  );

  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) TO authenticated, service_role;

-- 3) admin_set_user_role with audit
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_target_user uuid, p_role app_role, p_grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_target_user IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_target_user = auth.uid() AND p_role = 'admin' AND p_grant = false THEN
    RAISE EXCEPTION 'CANNOT_REVOKE_SELF_ADMIN';
  END IF;

  IF p_grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_target_user, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_target_user AND role = p_role;
  END IF;

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_grant THEN 'grant_role' ELSE 'revoke_role' END,
    p_target_user,
    jsonb_build_object('role', p_role::text)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role, boolean) TO authenticated, service_role;

-- 4) admin_delete_ocr_history with audit
CREATE OR REPLACE FUNCTION public.admin_delete_ocr_history(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT user_id INTO v_owner FROM public.ocr_history WHERE id = p_id;
  DELETE FROM public.ocr_history WHERE id = p_id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, target_id, details)
  VALUES (
    auth.uid(),
    'delete_ocr_history',
    v_owner,
    p_id::text,
    '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_ocr_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_ocr_history(uuid) TO authenticated, service_role;

-- 5) admin_cancel_order — cancel a PENDING order
CREATE OR REPLACE FUNCTION public.admin_cancel_order(p_order_id uuid, p_reason text DEFAULT 'admin_cancel')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_status text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT user_id, status INTO v_user, v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_status <> 'PENDING' THEN
    RAISE EXCEPTION 'ORDER_NOT_PENDING';
  END IF;

  UPDATE public.orders SET status = 'CANCELLED', updated_at = now() WHERE id = p_order_id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, target_id, details)
  VALUES (
    auth.uid(),
    'cancel_order',
    v_user,
    p_order_id::text,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(uuid, text) TO authenticated, service_role;
