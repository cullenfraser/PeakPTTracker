-- =====================================================================
-- COMPLETE CONTRACT FLOW MIGRATION
-- This script ensures all tables and columns exist for the entire flow:
-- Calculator → Client Entry → Contract → Invoice → Scheduling → Calendar
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. CONTRACTS TABLE (Core contract data)
-- =====================================================================
-- This should already exist, but ensure all invoice + participant columns
alter table public.contracts
  add column if not exists square_customer_id text,
  add column if not exists square_invoice_id text,
  add column if not exists square_payment_link text,
  add column if not exists invoice_status text default 'pending',
  add column if not exists participant_contract_count integer default 1,
  add column if not exists participant_contract_signed_count integer default 0;

update public.contracts
  set invoice_status = coalesce(invoice_status, 'pending')
  where invoice_status is null;

-- =====================================================================
-- 2. PARTICIPANT_CONTRACTS TABLE
-- =====================================================================
-- Already created in ADD_PARTICIPANT_CONTRACTS.sql, ensure invoice columns
alter table public.participant_contracts
  add column if not exists square_invoice_id text,
  add column if not exists square_payment_link text;

-- =====================================================================
-- 3. CONTRACT_SIGNATURES TABLE
-- =====================================================================
-- Already created in ADD_PARTICIPANT_CONTRACTS.sql
-- No additional changes needed

-- =====================================================================
-- 4. TRAINERS TABLE (for scheduling)
-- =====================================================================
create table if not exists public.trainers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
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

-- Add columns if missing
alter table public.trainers
  add column if not exists display_name text,
  add column if not exists status text default 'active',
  add column if not exists calendar_color text default '#3FAE52',
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists updated_at timestamptz;

create index if not exists trainers_display_name_idx
  on public.trainers (lower(display_name));

create index if not exists trainers_status_idx
  on public.trainers (status);

create index if not exists trainers_user_id_idx
  on public.trainers (user_id);

-- =====================================================================
-- 5. CONTRACT_SCHEDULE_ENTRIES TABLE (Weekly schedule)
-- =====================================================================
-- Drop and recreate to ensure correct schema
drop table if exists public.contract_schedule_entries cascade;

create table public.contract_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  schedule_day text not null,
  start_time time not null,
  recurring boolean default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists contract_schedule_entries_contract_id_idx
  on public.contract_schedule_entries (contract_id);

create index if not exists contract_schedule_entries_trainer_id_idx
  on public.contract_schedule_entries (trainer_id);

create index if not exists contract_schedule_entries_schedule_day_idx
  on public.contract_schedule_entries (schedule_day);

-- Enable RLS
alter table public.contract_schedule_entries enable row level security;

-- RLS Policies for contract_schedule_entries
drop policy if exists schedule_entries_owner_select on public.contract_schedule_entries;
create policy schedule_entries_owner_select
  on public.contract_schedule_entries
  for select
  using (created_by = auth.uid());

drop policy if exists schedule_entries_owner_insert on public.contract_schedule_entries;
create policy schedule_entries_owner_insert
  on public.contract_schedule_entries
  for insert
  with check (created_by = auth.uid());

drop policy if exists schedule_entries_owner_update on public.contract_schedule_entries;
create policy schedule_entries_owner_update
  on public.contract_schedule_entries
  for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists schedule_entries_owner_delete on public.contract_schedule_entries;
create policy schedule_entries_owner_delete
  on public.contract_schedule_entries
  for delete
  using (created_by = auth.uid());

-- =====================================================================
-- 6. TRAINING_SESSIONS TABLE (Calendar view)
-- =====================================================================
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

-- Add columns if missing
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

create index if not exists training_sessions_status_idx
  on public.training_sessions (status);

-- =====================================================================
-- 7. QUOTES TABLE (from calculator)
-- =====================================================================
-- Should already exist, ensure it has all needed columns
alter table public.quotes
  add column if not exists processing_fee numeric(10,2),
  add column if not exists discount_percent numeric(5,2);

-- =====================================================================
-- 8. QUOTE_PARTICIPANTS TABLE
-- =====================================================================
-- Should already exist from previous migrations
-- No additional columns needed

COMMIT;

-- =====================================================================
-- VERIFICATION QUERIES (run these separately to check)
-- =====================================================================
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' AND table_name = 'contract_schedule_entries'
-- ORDER BY ordinal_position;

-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' AND table_name = 'training_sessions'
-- ORDER BY ordinal_position;

-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' AND table_name = 'trainers'
-- ORDER BY ordinal_position;
