-- Function to get or initialize daily free uses for today
CREATE OR REPLACE FUNCTION get_daily_free_uses(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_used INT;
BEGIN
  -- Get today's date
  INSERT INTO daily_free_uses (user_id, date, used)
  VALUES (p_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, date) DO NOTHING;

  -- Get the current used count
  SELECT used INTO v_used
  FROM daily_free_uses
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  RETURN COALESCE(v_used, 0);
END;
$$;

-- Function to get remaining free uses for today
CREATE OR REPLACE FUNCTION get_remaining_free_uses(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_used INT;
BEGIN
  -- Ensure today's record exists
  PERFORM get_daily_free_uses(p_user_id);

  -- Get the current used count
  SELECT used INTO v_used
  FROM daily_free_uses
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  -- Return remaining (5 - used)
  RETURN 5 - COALESCE(v_used, 0);
END;
$$;

-- Function to deduct one free use
CREATE OR REPLACE FUNCTION deduct_daily_use(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining INT;
BEGIN
  -- Get remaining free uses
  v_remaining := get_remaining_free_uses(p_user_id);

  -- If no remaining uses, return false
  IF v_remaining <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Increment the used count
  UPDATE daily_free_uses
  SET used = used + 1
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  RETURN TRUE;
END;
$$;
