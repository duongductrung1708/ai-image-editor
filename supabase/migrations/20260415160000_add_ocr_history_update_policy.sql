-- Allow users to update their own OCR history rows.
-- Needed for lite-first flow: step 1 inserts, step 2 updates extracted_text + bounding_boxes.

alter table public.ocr_history enable row level security;

drop policy if exists "Users can update own OCR history" on public.ocr_history;

create policy "Users can update own OCR history" on public.ocr_history
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

