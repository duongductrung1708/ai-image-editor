-- Create daily_free_uses table to track free OCR uses per day
CREATE TABLE IF NOT EXISTS daily_free_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Ensure only one record per user per day
  UNIQUE(user_id, date)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_free_uses_user_date 
  ON daily_free_uses(user_id, date DESC);

-- Enable RLS
ALTER TABLE daily_free_uses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own daily free uses
CREATE POLICY "users_can_view_own_daily_free_uses"
  ON daily_free_uses
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own daily free uses
CREATE POLICY "users_can_insert_own_daily_free_uses"
  ON daily_free_uses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own daily free uses
CREATE POLICY "users_can_update_own_daily_free_uses"
  ON daily_free_uses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to get or initialize daily free uses for today
CREATE OR REPLACE FUNCTION get_today_daily_free_uses()
RETURNS TABLE (id UUID, used INTEGER, remaining INTEGER) AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_user_id UUID := auth.uid();
  v_record daily_free_uses%ROWTYPE;
BEGIN
  -- Check if record exists for today
  SELECT * INTO v_record FROM daily_free_uses
  WHERE user_id = v_user_id AND date = v_today;
  
  IF NOT FOUND THEN
    -- Create new record for today with 0 uses
    INSERT INTO daily_free_uses (user_id, date, used)
    VALUES (v_user_id, v_today, 0)
    RETURNING * INTO v_record;
  END IF;
  
  RETURN QUERY SELECT 
    v_record.id,
    v_record.used,
    (5 - v_record.used) AS remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to deduct daily free use
CREATE OR REPLACE FUNCTION deduct_daily_free_use()
RETURNS TABLE (success BOOLEAN, remaining INTEGER, message TEXT) AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_user_id UUID := auth.uid();
  v_record daily_free_uses%ROWTYPE;
BEGIN
  -- Lock and get today's record
  SELECT * INTO v_record FROM daily_free_uses
  WHERE user_id = v_user_id AND date = v_today
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- Initialize if not exists
    INSERT INTO daily_free_uses (user_id, date, used)
    VALUES (v_user_id, v_today, 0)
    RETURNING * INTO v_record;
  END IF;
  
  -- Check if still has free uses
  IF v_record.used >= 5 THEN
    RETURN QUERY SELECT false, 0::INTEGER, 'No free uses remaining'::TEXT;
    RETURN;
  END IF;
  
  -- Deduct one use
  UPDATE daily_free_uses
  SET used = used + 1, updated_at = now()
  WHERE id = v_record.id
  RETURNING * INTO v_record;
  
  RETURN QUERY SELECT true, (5 - v_record.used)::INTEGER, ''::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
