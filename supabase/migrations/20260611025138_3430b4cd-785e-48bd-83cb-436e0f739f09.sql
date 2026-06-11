
-- Drop unsafe client-writable policies
DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.credit_transactions;

-- Backfill missing user_credits rows for pre-trigger users
INSERT INTO public.user_credits (user_id, balance)
SELECT u.id, 0
FROM auth.users u
LEFT JOIN public.user_credits c ON c.user_id = u.id
WHERE c.user_id IS NULL;

-- Make deduct_credit log its own transaction (server-side, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.deduct_credit(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.user_credits
  SET balance = balance - 1, updated_at = now()
  WHERE user_id = p_user_id AND balance > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (p_user_id, -1, 'usage', 'OCR usage');
  END IF;
END;
$$;
