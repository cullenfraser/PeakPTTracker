-- =============================================================
-- Trainer Directory, Schedule Entries, and Calendar Support
-- Run these statements in order. They are idempotent where possible.
-- =============================================================

-- 1. Trainers table -------------------------------------------------
create table if not exists public.trainers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  first_name text,
  last_name text,
  display_name text,
  email text,
  phone text,
  status text default 'active',
  bio text,
  specialties jsonb,
  hourly_rate numeric(10,2),
  salary numeric(12,2),
  payment_type text,
  avatar_url text,
  user_id uuid references auth.users(id),
  calendar_color text default '#3FAE52'
);

alter table public.trainers
  add column if not exists display_name text,
  add column if not exists status text default 'active',
  add column if not exists calendar_color text default '#3FAE52',
  add column if not exists user_id uuid references auth.users(id);

create index if not exists trainers_display_name_idx
  on public.trainers (lower(display_name));

create index if not exists trainers_status_idx
  on public.trainers (status);

-- 2. Contract schedule entries --------------------------------------
create table if not exists public.contract_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id),
  schedule_day text not null,
  start_time time not null,
  recurring boolean default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.contract_schedule_entries
  add column if not exists schedule_day text,
  add column if not exists start_time time,
  add column if not exists recurring boolean default true,
  add column if not exists notes text;

create index if not exists contract_schedule_entries_contract_id_idx
  on public.contract_schedule_entries (contract_id);

create index if not exists contract_schedule_entries_trainer_id_idx
  on public.contract_schedule_entries (trainer_id);

create index if not exists contract_schedule_entries_schedule_day_idx
  on public.contract_schedule_entries (schedule_day);

-- RLS policies for contract_schedule_entries
alter table public.contract_schedule_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'contract_schedule_entries' and policyname = 'schedule_entries_owner_select'
  ) then
    create policy schedule_entries_owner_select
      on public.contract_schedule_entries
      for select
      using (created_by = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'contract_schedule_entries' and policyname = 'schedule_entries_owner_insert'
  ) then
    create policy schedule_entries_owner_insert
      on public.contract_schedule_entries
      for insert
      with check (created_by = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'contract_schedule_entries' and policyname = 'schedule_entries_owner_update'
  ) then
    create policy schedule_entries_owner_update
      on public.contract_schedule_entries
      for update
      using (created_by = auth.uid())
      with check (created_by = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'contract_schedule_entries' and policyname = 'schedule_entries_owner_delete'
  ) then
    create policy schedule_entries_owner_delete
      on public.contract_schedule_entries
      for delete
      using (created_by = auth.uid());
  end if;
end $$;

-- 3. Training sessions table (Calendar view) ------------------------
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete set null,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  session_number integer,
  session_type text,
  status text default 'scheduled',
  notes text,
  class_type text,
  team text,
  participant_ids uuid[] default '{}',
  participants_attended jsonb,
  attendance_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.training_sessions
  add column if not exists session_type text,
  add column if not exists status text default 'scheduled',
  add column if not exists notes text,
  add column if not exists class_type text,
  add column if not exists team text,
  add column if not exists participant_ids uuid[] default '{}',
  add column if not exists participants_attended jsonb,
  add column if not exists attendance_notes text,
  add column if not exists session_number integer,
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

create index if not exists training_sessions_contract_id_idx
  on public.training_sessions (contract_id);

create index if not exists training_sessions_trainer_id_idx
  on public.training_sessions (trainer_id);

create index if not exists training_sessions_session_date_idx
  on public.training_sessions (session_date);

-- 4. Optional seed data ---------------------------------------------
-- Uncomment and adjust the inserts below with your real trainers if needed.
--
-- insert into public.trainers (display_name, first_name, last_name, email, status)
-- values
--   ('Rick Leger', 'Rick', 'Leger', 'rick@example.com', 'active'),
--   ('Cullen Fraser', 'Cullen', 'Fraser', 'cullen@example.com', 'active')
-- on conflict (display_name) do nothing;

-- 5. Invoice columns (if not yet added) -----------------------------
alter table public.contracts
  add column if not exists square_customer_id text,
  add column if not exists square_invoice_id text,
  add column if not exists square_payment_link text,
  add column if not exists invoice_status text default 'pending';

update public.contracts
  set invoice_status = coalesce(invoice_status, 'pending')
  where invoice_status is null;

-- =============================================================
-- End of script
-- =============================================================
