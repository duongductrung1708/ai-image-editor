
CREATE OR REPLACE FUNCTION public.deduct_credit(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.user_credits
  SET balance = balance - 1
  WHERE user_id = p_user_id AND balance > 0;
END;
$$;
