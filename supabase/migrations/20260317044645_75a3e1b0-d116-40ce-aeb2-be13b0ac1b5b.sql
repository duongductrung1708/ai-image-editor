
CREATE TABLE public.ocr_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_name TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  bounding_boxes JSONB,
  image_data TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ocr_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view OCR history" ON public.ocr_history FOR SELECT USING (true);
CREATE POLICY "Anyone can insert OCR history" ON public.ocr_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete OCR history" ON public.ocr_history FOR DELETE USING (true);
