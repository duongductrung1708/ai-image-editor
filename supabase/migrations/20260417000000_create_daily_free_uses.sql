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


