-- Add image_data column to ocr_batch_pages to store image of each page
alter table public.ocr_batch_pages
add column if not exists image_data text;

-- Add comment for clarity
comment on column public.ocr_batch_pages.image_data is 'Base64 encoded image data for each page';
