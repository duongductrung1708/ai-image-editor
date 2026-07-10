
-- Admin-only helpers. Each function verifies the caller is an admin via has_role.

-- 1) Adjust a user's credit balance and log to credit_transactions
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  p_target_user uuid,
  p_delta integer,
  p_reason text DEFAULT 'admin_adjust'
)
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
    SET balance = GREATEST(0, public.user_credits.balance + EXCLUDED.balance - GREATEST(EXCLUDED.balance,0) + p_delta),
        updated_at = now()
  RETURNING balance INTO v_balance;

  -- Simpler: overwrite calculation above with a direct update path
  UPDATE public.user_credits
  SET balance = GREATEST(0, balance),
      updated_at = now()
  WHERE user_id = p_target_user
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (p_target_user, p_delta, CASE WHEN p_delta > 0 THEN 'admin_topup' ELSE 'admin_debit' END, p_reason);

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_credits(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) TO authenticated, service_role;

-- 2) Delete an OCR history row
CREATE OR REPLACE FUNCTION public.admin_delete_ocr_history(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  DELETE FROM public.ocr_history WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_ocr_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_ocr_history(uuid) TO authenticated, service_role;

-- 3) Grant/revoke role for another user
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_target_user uuid,
  p_role public.app_role,
  p_grant boolean
)
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

  -- Prevent an admin from revoking their own admin role (avoid lockout by mistake)
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
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, public.app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role, boolean) TO authenticated, service_role;

-- 4) Daily aggregated stats for last N days
CREATE OR REPLACE FUNCTION public.admin_daily_stats(p_days integer DEFAULT 30)
RETURNS TABLE (
  day date,
  revenue numeric,
  ocr_count bigint,
  new_users bigint,
  paid_orders bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - GREATEST(LEAST(p_days, 365), 1) + 1),
      CURRENT_DATE,
      interval '1 day'
    )::date AS day
  ),
  guard AS (
    SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN true
                ELSE (SELECT 1/0) = 0 END AS ok
  )
  SELECT
    d.day,
    COALESCE((SELECT SUM(amount) FROM public.orders
              WHERE status = 'PAID' AND created_at::date = d.day), 0)::numeric AS revenue,
    COALESCE((SELECT COUNT(*) FROM public.ocr_history
              WHERE created_at::date = d.day), 0)::bigint AS ocr_count,
    COALESCE((SELECT COUNT(*) FROM public.profiles
              WHERE created_at::date = d.day), 0)::bigint AS new_users,
    COALESCE((SELECT COUNT(*) FROM public.orders
              WHERE status = 'PAID' AND created_at::date = d.day), 0)::bigint AS paid_orders
  FROM days d, guard
  ORDER BY d.day ASC;
$$;

REVOKE ALL ON FUNCTION public.admin_daily_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats(integer) TO authenticated, service_role;
