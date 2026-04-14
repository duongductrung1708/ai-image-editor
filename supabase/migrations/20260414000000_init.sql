-- Baseline migration (consolidated).
-- This file replaces all previous migrations and represents the final schema state.

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- 1) Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can view own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "Users can update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can insert own profile" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 1b) Credits (balance + transactions)
create table if not exists public.user_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  balance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;

drop policy if exists "Users can view own credits" on public.user_credits;
drop policy if exists "Users can update own credits" on public.user_credits;
drop policy if exists "Users can insert own credits" on public.user_credits;

create policy "Users can view own credits" on public.user_credits
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can update own credits" on public.user_credits
  for update to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own credits" on public.user_credits
  for insert to authenticated
  with check (user_id = auth.uid());

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('topup', 'usage', 'bonus')),
  description text default '',
  vnpay_txn_ref text,
  created_at timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

drop policy if exists "Users can view own transactions" on public.credit_transactions;
drop policy if exists "Users can insert own transactions" on public.credit_transactions;

create policy "Users can view own transactions" on public.credit_transactions
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own transactions" on public.credit_transactions
  for insert to authenticated
  with check (user_id = auth.uid());

-- Auto-create credits row for new users
create or replace function public.handle_new_user_credits()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.user_credits (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_credits on auth.users;
create trigger on_auth_user_created_credits
  after insert on auth.users
  for each row execute function public.handle_new_user_credits();

-- Update timestamp trigger for user_credits
create or replace function public.update_credits_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_user_credits_updated_at on public.user_credits;
create trigger update_user_credits_updated_at
  before update on public.user_credits
  for each row execute function public.update_credits_updated_at();

-- Deduct 1 credit (server-side helper)
create or replace function public.deduct_credit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.user_credits
  set balance = balance - 1
  where user_id = p_user_id and balance > 0;
end;
$$;

-- 2) OCR history (single)
create table if not exists public.ocr_history (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade,
  image_name text not null,
  extracted_text text not null,
  bounding_boxes jsonb,
  image_data text,
  created_at timestamptz not null default now()
);

alter table public.ocr_history enable row level security;

drop policy if exists "Users can view own OCR history" on public.ocr_history;
drop policy if exists "Users can insert own OCR history" on public.ocr_history;
drop policy if exists "Users can delete own OCR history" on public.ocr_history;

create policy "Users can view own OCR history" on public.ocr_history
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own OCR history" on public.ocr_history
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own OCR history" on public.ocr_history
  for delete to authenticated
  using (user_id = auth.uid());

-- 3) OCR batch
create table if not exists public.ocr_batch_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  page_count integer not null default 0,
  ok_count integer not null default 0,
  fail_count integer not null default 0,
  concurrency integer not null default 1,
  merged_markdown text not null default '',
  preview_image_data text
);

create table if not exists public.ocr_batch_pages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ocr_batch_sessions (id) on delete cascade,
  page_index integer not null,
  file_name text not null default '',
  ok boolean not null default true,
  markdown text not null default '',
  full_text text not null default '',
  blocks jsonb default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_batch_pages_session on public.ocr_batch_pages (session_id);

alter table public.ocr_batch_sessions enable row level security;
alter table public.ocr_batch_pages enable row level security;

drop policy if exists "Users can view own batch sessions" on public.ocr_batch_sessions;
drop policy if exists "Users can insert own batch sessions" on public.ocr_batch_sessions;
drop policy if exists "Users can delete own batch sessions" on public.ocr_batch_sessions;

create policy "Users can view own batch sessions" on public.ocr_batch_sessions
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own batch sessions" on public.ocr_batch_sessions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own batch sessions" on public.ocr_batch_sessions
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can view own batch pages" on public.ocr_batch_pages;
drop policy if exists "Users can insert own batch pages" on public.ocr_batch_pages;
drop policy if exists "Users can delete own batch pages" on public.ocr_batch_pages;

create policy "Users can view own batch pages" on public.ocr_batch_pages
  for select to authenticated
  using (
    exists (
      select 1
      from public.ocr_batch_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "Users can insert own batch pages" on public.ocr_batch_pages
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.ocr_batch_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "Users can delete own batch pages" on public.ocr_batch_pages
  for delete to authenticated
  using (
    exists (
      select 1
      from public.ocr_batch_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

