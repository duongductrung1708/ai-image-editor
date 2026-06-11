-- =====================================================================
-- VetaOCR — Consolidated database setup (single-file)
-- ---------------------------------------------------------------------
-- Run this once on a fresh Supabase project (SQL editor or psql) to
-- recreate the entire schema: tables, indexes, grants, RLS policies,
-- functions and triggers (including the auth.users hook).
--
-- Idempotent: safe to re-run. Uses CREATE ... IF NOT EXISTS / OR REPLACE
-- and DROP POLICY IF EXISTS before CREATE POLICY.
-- =====================================================================

-- ---------- Extensions ----------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- TABLES
-- =====================================================================

-- ---------- profiles ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ---------- user_credits --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_credits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE,
  balance    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- ---------- credit_transactions ------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  amount         integer NOT NULL,
  type           text NOT NULL CHECK (type IN ('topup','usage','bonus')),
  description    text DEFAULT '',
  vnpay_txn_ref  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- ---------- daily_free_uses ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_free_uses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date NOT NULL,
  used       integer NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_free_uses_user_date
  ON public.daily_free_uses (user_id, date DESC);
GRANT SELECT ON public.daily_free_uses TO authenticated;
GRANT ALL ON public.daily_free_uses TO service_role;
ALTER TABLE public.daily_free_uses ENABLE ROW LEVEL SECURITY;

-- ---------- ocr_history ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ocr_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  image_name     text NOT NULL,
  extracted_text text NOT NULL,
  bounding_boxes jsonb,
  image_data     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_history TO authenticated;
GRANT ALL ON public.ocr_history TO service_role;
ALTER TABLE public.ocr_history ENABLE ROW LEVEL SECURITY;

-- ---------- ocr_batch_sessions -------------------------------------------
CREATE TABLE IF NOT EXISTS public.ocr_batch_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  page_count         integer NOT NULL DEFAULT 0,
  ok_count           integer NOT NULL DEFAULT 0,
  fail_count         integer NOT NULL DEFAULT 0,
  concurrency        integer NOT NULL DEFAULT 1,
  merged_markdown    text NOT NULL DEFAULT '',
  preview_image_data text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_batch_sessions TO authenticated;
GRANT ALL ON public.ocr_batch_sessions TO service_role;
ALTER TABLE public.ocr_batch_sessions ENABLE ROW LEVEL SECURITY;

-- ---------- ocr_batch_pages ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.ocr_batch_pages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.ocr_batch_sessions(id) ON DELETE CASCADE,
  page_index  integer NOT NULL,
  file_name   text NOT NULL DEFAULT '',
  ok          boolean NOT NULL DEFAULT true,
  markdown    text NOT NULL DEFAULT '',
  full_text   text NOT NULL DEFAULT '',
  blocks      jsonb DEFAULT '[]'::jsonb,
  error       text,
  image_data  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_batch_pages_session
  ON public.ocr_batch_pages (session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_batch_pages TO authenticated;
GRANT ALL ON public.ocr_batch_pages TO service_role;
ALTER TABLE public.ocr_batch_pages ENABLE ROW LEVEL SECURITY;

-- ---------- ocr_jobs ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ocr_jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'queued'
             CHECK (status IN ('queued','processing','done','failed')),
  result     jsonb,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_user_created
  ON public.ocr_jobs (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_jobs TO authenticated;
GRANT ALL ON public.ocr_jobs TO service_role;
ALTER TABLE public.ocr_jobs ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS POLICIES
-- =====================================================================

-- profiles
DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- user_credits (read-only for end users; writes go through SECURITY DEFINER RPCs or service_role)
DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;
CREATE POLICY "Users can view own credits" ON public.user_credits FOR SELECT TO authenticated USING (user_id = auth.uid());

-- credit_transactions (read-only for end users)
DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own transactions" ON public.credit_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- daily_free_uses (read-only; writes via RPC or service_role)
DROP POLICY IF EXISTS "users_can_view_own_daily_free_uses" ON public.daily_free_uses;
CREATE POLICY "users_can_view_own_daily_free_uses" ON public.daily_free_uses FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ocr_history
DROP POLICY IF EXISTS "Users can view own OCR history"   ON public.ocr_history;
DROP POLICY IF EXISTS "Users can insert own OCR history" ON public.ocr_history;
DROP POLICY IF EXISTS "Users can delete own OCR history" ON public.ocr_history;
CREATE POLICY "Users can view own OCR history"   ON public.ocr_history FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own OCR history" ON public.ocr_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own OCR history" ON public.ocr_history FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ocr_batch_sessions
DROP POLICY IF EXISTS "Users can view own batch sessions"   ON public.ocr_batch_sessions;
DROP POLICY IF EXISTS "Users can insert own batch sessions" ON public.ocr_batch_sessions;
DROP POLICY IF EXISTS "Users can delete own batch sessions" ON public.ocr_batch_sessions;
CREATE POLICY "Users can view own batch sessions"   ON public.ocr_batch_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own batch sessions" ON public.ocr_batch_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own batch sessions" ON public.ocr_batch_sessions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ocr_batch_pages (scoped via parent session ownership)
DROP POLICY IF EXISTS "Users can view own batch pages"   ON public.ocr_batch_pages;
DROP POLICY IF EXISTS "Users can insert own batch pages" ON public.ocr_batch_pages;
DROP POLICY IF EXISTS "Users can delete own batch pages" ON public.ocr_batch_pages;
CREATE POLICY "Users can view own batch pages" ON public.ocr_batch_pages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ocr_batch_sessions s WHERE s.id = ocr_batch_pages.session_id AND s.user_id = auth.uid()));
CREATE POLICY "Users can insert own batch pages" ON public.ocr_batch_pages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ocr_batch_sessions s WHERE s.id = ocr_batch_pages.session_id AND s.user_id = auth.uid()));
CREATE POLICY "Users can delete own batch pages" ON public.ocr_batch_pages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ocr_batch_sessions s WHERE s.id = ocr_batch_pages.session_id AND s.user_id = auth.uid()));

-- ocr_jobs
DROP POLICY IF EXISTS "Users can view own OCR jobs"   ON public.ocr_jobs;
DROP POLICY IF EXISTS "Users can insert own OCR jobs" ON public.ocr_jobs;
DROP POLICY IF EXISTS "Users can update own OCR jobs" ON public.ocr_jobs;
DROP POLICY IF EXISTS "Users can delete own OCR jobs" ON public.ocr_jobs;
CREATE POLICY "Users can view own OCR jobs"   ON public.ocr_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own OCR jobs" ON public.ocr_jobs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own OCR jobs" ON public.ocr_jobs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own OCR jobs" ON public.ocr_jobs FOR DELETE TO authenticated USING (user_id = auth.uid());

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- ---------- generic updated_at triggers ----------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_credits_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ---------- auth.users hooks: create profile + credits on signup ---------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture')
  );
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- ---------- credit operations (SECURITY DEFINER) -------------------------
CREATE OR REPLACE FUNCTION public.deduct_credit(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_updated integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  UPDATE public.user_credits SET balance = balance - 1, updated_at = now()
   WHERE user_id = p_user_id AND balance > 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (p_user_id, -1, 'usage', 'OCR usage');
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.charge_credits(p_user_id uuid, p_amount integer, p_reason text DEFAULT 'ocr')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_balance integer;
BEGIN
  SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;
  UPDATE public.user_credits SET balance = balance - p_amount, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, -p_amount, 'usage', p_reason);
  RETURN v_balance - p_amount;
END; $$;

CREATE OR REPLACE FUNCTION public.refund_credits(p_user_id uuid, p_amount integer, p_reason text DEFAULT 'refund')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.user_credits SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, p_amount, 'topup', p_reason);
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_rate_limit(p_user_id uuid, p_ip text, p_scope text, p_window_seconds integer, p_max integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.credit_transactions
   WHERE user_id = p_user_id AND type = 'usage'
     AND created_at > now() - (p_window_seconds || ' seconds')::interval;
  IF v_count >= p_max THEN RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED'; END IF;
END; $$;

-- ---------- daily free-uses operations ------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_free_uses(p_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

-- ---------- EXECUTE grants (lock down anon) ------------------------------
REVOKE EXECUTE ON FUNCTION
  public.deduct_credit(uuid),
  public.charge_credits(uuid, integer, text),
  public.refund_credits(uuid, integer, text),
  public.enforce_rate_limit(uuid, text, text, integer, integer),
  public.get_daily_free_uses(uuid),
  public.get_remaining_free_uses(uuid),
  public.deduct_daily_use(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.deduct_credit(uuid),
  public.charge_credits(uuid, integer, text),
  public.refund_credits(uuid, integer, text),
  public.get_daily_free_uses(uuid),
  public.get_remaining_free_uses(uuid),
  public.deduct_daily_use(uuid)
TO authenticated;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

DROP TRIGGER IF EXISTS update_user_credits_updated_at ON public.user_credits;
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_credits_updated_at();

DROP TRIGGER IF EXISTS trg_ocr_jobs_updated_at ON public.ocr_jobs;
CREATE TRIGGER trg_ocr_jobs_updated_at
  BEFORE UPDATE ON public.ocr_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auth.users hooks (create profile + credits row on signup)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();

-- =====================================================================
-- DONE — verify with: select count(*) from pg_tables where schemaname='public';
-- =====================================================================
