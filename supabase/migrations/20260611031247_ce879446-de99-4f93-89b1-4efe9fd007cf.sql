CREATE OR REPLACE FUNCTION public.add_credits(p_user_id uuid, p_amount integer, p_reason text DEFAULT 'topup', p_txn_ref text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  INSERT INTO public.user_credits (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_credits.balance + EXCLUDED.balance,
        updated_at = now()
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, vnpay_txn_ref)
  VALUES (p_user_id, p_amount, 'topup', p_reason, p_txn_ref);

  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text) TO service_role;