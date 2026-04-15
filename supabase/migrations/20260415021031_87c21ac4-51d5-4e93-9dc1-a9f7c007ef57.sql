
-- charge_credits: atomically deduct credits, raise exception if insufficient
CREATE OR REPLACE FUNCTION public.charge_credits(p_user_id uuid, p_amount integer, p_reason text DEFAULT 'ocr')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  -- Lock the row for update
  SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
  
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;
  
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;
  
  UPDATE user_credits SET balance = balance - p_amount, updated_at = now() WHERE user_id = p_user_id;
  
  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, -p_amount, 'charge', p_reason);
  
  RETURN v_balance - p_amount;
END;
$$;

-- refund_credits: add credits back
CREATE OR REPLACE FUNCTION public.refund_credits(p_user_id uuid, p_amount integer, p_reason text DEFAULT 'refund')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_credits SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_user_id;
  
  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, p_amount, 'refund', p_reason);
END;
$$;

-- enforce_rate_limit: simple rate limiting using credit_transactions as log
-- For now, a no-op that doesn't raise (fail-open) since we don't have a rate_limit table yet
CREATE OR REPLACE FUNCTION public.enforce_rate_limit(p_user_id uuid, p_ip text, p_scope text, p_window_seconds integer, p_max integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM credit_transactions
  WHERE user_id = p_user_id
    AND type = 'charge'
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;
  
  IF v_count >= p_max THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED';
  END IF;
END;
$$;
