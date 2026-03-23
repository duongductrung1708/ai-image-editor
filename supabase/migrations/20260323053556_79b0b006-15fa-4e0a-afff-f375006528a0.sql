
-- 1. Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Add user_id columns
ALTER TABLE public.ocr_history ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ocr_batch_sessions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Update RLS policies for ocr_history (drop old permissive ones, add user-scoped)
DROP POLICY IF EXISTS "Anyone can view OCR history" ON public.ocr_history;
DROP POLICY IF EXISTS "Anyone can insert OCR history" ON public.ocr_history;
DROP POLICY IF EXISTS "Anyone can delete OCR history" ON public.ocr_history;

CREATE POLICY "Users can view own OCR history" ON public.ocr_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own OCR history" ON public.ocr_history
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own OCR history" ON public.ocr_history
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 4. Update RLS for batch sessions
DROP POLICY IF EXISTS "Anyone can view batch sessions" ON public.ocr_batch_sessions;
DROP POLICY IF EXISTS "Anyone can insert batch sessions" ON public.ocr_batch_sessions;
DROP POLICY IF EXISTS "Anyone can delete batch sessions" ON public.ocr_batch_sessions;

CREATE POLICY "Users can view own batch sessions" ON public.ocr_batch_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own batch sessions" ON public.ocr_batch_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own batch sessions" ON public.ocr_batch_sessions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 5. Update RLS for batch pages (via session ownership)
DROP POLICY IF EXISTS "Anyone can view batch pages" ON public.ocr_batch_pages;
DROP POLICY IF EXISTS "Anyone can insert batch pages" ON public.ocr_batch_pages;
DROP POLICY IF EXISTS "Anyone can delete batch pages" ON public.ocr_batch_pages;

CREATE POLICY "Users can view own batch pages" ON public.ocr_batch_pages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ocr_batch_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own batch pages" ON public.ocr_batch_pages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.ocr_batch_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own batch pages" ON public.ocr_batch_pages
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ocr_batch_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
  );
