
-- 1) Add image_data to ocr_batch_pages
ALTER TABLE public.ocr_batch_pages
  ADD COLUMN IF NOT EXISTS image_data text;

-- 2) Daily free uses
CREATE TABLE IF NOT EXISTS public.daily_free_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_free_uses_user_date
  ON public.daily_free_uses(user_id, date DESC);

GRANT SELECT ON public.daily_free_uses TO authenticated;
GRANT ALL ON public.daily_free_uses TO service_role;

ALTER TABLE public.daily_free_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_view_own_daily_free_uses" ON public.daily_free_uses;
CREATE POLICY "users_can_view_own_daily_free_uses"
  ON public.daily_free_uses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_daily_free_uses(p_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_used int;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  INSERT INTO public.daily_free_uses (user_id, date, used)
  VALUES (p_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, date) DO NOTHING;
  SELECT used INTO v_used FROM public.daily_free_uses
  WHERE user_id = p_user_id AND date = CURRENT_DATE;
  RETURN COALESCE(v_used, 0);
END; $$;

CREATE OR REPLACE FUNCTION public.get_remaining_free_uses(p_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_used int;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  PERFORM public.get_daily_free_uses(p_user_id);
  SELECT used INTO v_used FROM public.daily_free_uses
  WHERE user_id = p_user_id AND date = CURRENT_DATE;
  RETURN 5 - COALESCE(v_used, 0);
END; $$;

CREATE OR REPLACE FUNCTION public.deduct_daily_use(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_remaining int;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  v_remaining := public.get_remaining_free_uses(p_user_id);
  IF v_remaining <= 0 THEN RETURN FALSE; END IF;
  UPDATE public.daily_free_uses SET used = used + 1
  WHERE user_id = p_user_id AND date = CURRENT_DATE;
  RETURN TRUE;
END; $$;

-- 3) OCR async jobs
CREATE TABLE IF NOT EXISTS public.ocr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_user_created
  ON public.ocr_jobs(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_jobs TO authenticated;
GRANT ALL ON public.ocr_jobs TO service_role;

ALTER TABLE public.ocr_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own OCR jobs" ON public.ocr_jobs;
DROP POLICY IF EXISTS "Users can insert own OCR jobs" ON public.ocr_jobs;
DROP POLICY IF EXISTS "Users can update own OCR jobs" ON public.ocr_jobs;
DROP POLICY IF EXISTS "Users can delete own OCR jobs" ON public.ocr_jobs;

CREATE POLICY "Users can view own OCR jobs" ON public.ocr_jobs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own OCR jobs" ON public.ocr_jobs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own OCR jobs" ON public.ocr_jobs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own OCR jobs" ON public.ocr_jobs
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.updated_at = now(); RETURN new; END; $$;

DROP TRIGGER IF EXISTS trg_ocr_jobs_updated_at ON public.ocr_jobs;
CREATE TRIGGER trg_ocr_jobs_updated_at
BEFORE UPDATE ON public.ocr_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
