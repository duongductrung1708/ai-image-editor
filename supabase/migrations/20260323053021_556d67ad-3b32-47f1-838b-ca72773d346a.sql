
-- Batch sessions table
CREATE TABLE public.ocr_batch_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  page_count integer NOT NULL DEFAULT 0,
  ok_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  concurrency integer NOT NULL DEFAULT 1,
  merged_markdown text NOT NULL DEFAULT '',
  preview_image_data text
);

-- Batch pages table
CREATE TABLE public.ocr_batch_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ocr_batch_sessions(id) ON DELETE CASCADE,
  page_index integer NOT NULL,
  file_name text NOT NULL DEFAULT '',
  ok boolean NOT NULL DEFAULT true,
  markdown text NOT NULL DEFAULT '',
  full_text text NOT NULL DEFAULT '',
  blocks jsonb DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_batch_pages_session ON public.ocr_batch_pages(session_id);

-- RLS
ALTER TABLE public.ocr_batch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_batch_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view batch sessions" ON public.ocr_batch_sessions FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert batch sessions" ON public.ocr_batch_sessions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can delete batch sessions" ON public.ocr_batch_sessions FOR DELETE TO public USING (true);

CREATE POLICY "Anyone can view batch pages" ON public.ocr_batch_pages FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert batch pages" ON public.ocr_batch_pages FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can delete batch pages" ON public.ocr_batch_pages FOR DELETE TO public USING (true);
