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

-- Atomic credit charge + audit log (for paid OCR / API usage).
-- Raises an exception if balance is insufficient.
create or replace function public.charge_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text default ''
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    select balance into new_balance
    from public.user_credits
    where user_id = p_user_id;
    return coalesce(new_balance, 0);
  end if;

  update public.user_credits
  set balance = balance - p_amount
  where user_id = p_user_id and balance >= p_amount
  returning balance into new_balance;

  if new_balance is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.credit_transactions (user_id, amount, type, description)
  values (p_user_id, -p_amount, 'usage', concat('OCR usage: -', p_amount, ' credits', case when p_reason <> '' then concat(' (', p_reason, ')') else '' end));

  return new_balance;
end;
$$;

-- Best-effort refund (used when OCR fails after charging).
create or replace function public.refund_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text default ''
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    select balance into new_balance
    from public.user_credits
    where user_id = p_user_id;
    return coalesce(new_balance, 0);
  end if;

  update public.user_credits
  set balance = balance + p_amount
  where user_id = p_user_id
  returning balance into new_balance;

  if new_balance is null then
    insert into public.user_credits (user_id, balance)
    values (p_user_id, p_amount)
    on conflict (user_id) do update set balance = public.user_credits.balance + excluded.balance
    returning balance into new_balance;
  end if;

  insert into public.credit_transactions (user_id, amount, type, description)
  values (p_user_id, p_amount, 'bonus', concat('OCR refund: +', p_amount, ' credits', case when p_reason <> '' then concat(' (', p_reason, ')') else '' end));

  return coalesce(new_balance, 0);
end;
$$;

-- Basic server-side rate limiting (per user + ip + scope).
create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ip text not null default '',
  scope text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ip, scope)
);

alter table public.api_rate_limits enable row level security;

-- No direct access from client
drop policy if exists "No access" on public.api_rate_limits;
create policy "No access" on public.api_rate_limits
  for all to authenticated
  using (false)
  with check (false);

create or replace function public.update_api_rate_limits_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_api_rate_limits_updated_at on public.api_rate_limits;
create trigger update_api_rate_limits_updated_at
  before update on public.api_rate_limits
  for each row execute function public.update_api_rate_limits_updated_at();

-- Enforce rate-limit. Raises exception 'RATE_LIMIT' if exceeded.
create or replace function public.enforce_rate_limit(
  p_user_id uuid,
  p_ip text,
  p_scope text,
  p_window_seconds integer,
  p_max integer
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  now_ts timestamptz := now();
  win_start timestamptz := now_ts - make_interval(secs => greatest(1, p_window_seconds));
  cur record;
  next_count integer;
begin
  if p_max is null or p_max <= 0 then
    return 0;
  end if;

  insert into public.api_rate_limits (user_id, ip, scope, window_start, count)
  values (p_user_id, coalesce(p_ip, ''), p_scope, now_ts, 0)
  on conflict (user_id, ip, scope) do nothing;

  select window_start, count
  into cur
  from public.api_rate_limits
  where user_id = p_user_id and ip = coalesce(p_ip, '') and scope = p_scope
  for update;

  if cur.window_start < win_start then
    update public.api_rate_limits
    set window_start = now_ts, count = 1
    where user_id = p_user_id and ip = coalesce(p_ip, '') and scope = p_scope
    returning count into next_count;
  else
    update public.api_rate_limits
    set count = count + 1
    where user_id = p_user_id and ip = coalesce(p_ip, '') and scope = p_scope
    returning count into next_count;
  end if;

  if next_count > p_max then
    raise exception 'RATE_LIMIT';
  end if;

  return greatest(0, p_max - next_count);
end;
$$;

-- Idempotency keys (anti-replay) for billing endpoints.
create table if not exists public.api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null,
  key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (user_id, scope, key)
);

alter table public.api_idempotency_keys enable row level security;

drop policy if exists "No access" on public.api_idempotency_keys;
create policy "No access" on public.api_idempotency_keys
  for all to authenticated
  using (false)
  with check (false);

-- Consume an idempotency key or raise exception 'IDEMPOTENCY_REPLAY'.
create or replace function public.consume_idempotency_key(
  p_user_id uuid,
  p_scope text,
  p_key text,
  p_ttl_seconds integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ttl integer := greatest(1, coalesce(p_ttl_seconds, 600));
  now_ts timestamptz := now();
  existing record;
begin
  if p_key is null or btrim(p_key) = '' then
    -- No key provided; allow request (dev-friendly).
    return;
  end if;

  -- Opportunistic cleanup (keeps table small without cron).
  delete from public.api_idempotency_keys
  where expires_at < now_ts;

  select 1 as ok
  into existing
  from public.api_idempotency_keys
  where user_id = p_user_id and scope = p_scope and key = p_key and expires_at >= now_ts
  limit 1;

  if existing.ok is not null then
    raise exception 'IDEMPOTENCY_REPLAY';
  end if;

  insert into public.api_idempotency_keys (user_id, scope, key, expires_at)
  values (p_user_id, p_scope, p_key, now_ts + make_interval(secs => ttl));
end;
$$;

-- Strengthen VNPay idempotency at DB level.
create unique index if not exists uq_credit_transactions_vnpay_ref
on public.credit_transactions (user_id, vnpay_txn_ref)
where vnpay_txn_ref is not null;

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

