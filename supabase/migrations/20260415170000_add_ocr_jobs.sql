-- OCR async jobs
create table if not exists public.ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ocr_jobs_user_created
on public.ocr_jobs (user_id, created_at desc);

alter table public.ocr_jobs enable row level security;

drop policy if exists "Users can view own OCR jobs" on public.ocr_jobs;
drop policy if exists "Users can insert own OCR jobs" on public.ocr_jobs;
drop policy if exists "Users can update own OCR jobs" on public.ocr_jobs;
drop policy if exists "Users can delete own OCR jobs" on public.ocr_jobs;

create policy "Users can view own OCR jobs" on public.ocr_jobs
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own OCR jobs" on public.ocr_jobs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own OCR jobs" on public.ocr_jobs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own OCR jobs" on public.ocr_jobs
  for delete to authenticated
  using (user_id = auth.uid());

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ocr_jobs_updated_at on public.ocr_jobs;
create trigger trg_ocr_jobs_updated_at
before update on public.ocr_jobs
for each row execute function public.set_updated_at();

