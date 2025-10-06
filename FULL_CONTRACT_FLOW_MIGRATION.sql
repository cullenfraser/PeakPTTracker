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

-- =====================================================================
-- 9. ADMIN USERS TABLE
-- =====================================================================
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  role text not null default 'admin',
  is_active boolean not null default true
);

create unique index if not exists admin_users_user_id_idx
  on public.admin_users (user_id);

-- Ensure legacy installations cast is_active to boolean
alter table public.admin_users
  alter column is_active type boolean
  using (
    case
      when is_active in ('true', 't', '1', 'on', 'yes') then true
      when is_active in ('false', 'f', '0', 'off', 'no') then false
      else coalesce(is_active::boolean, true)
    end
  );

-- =====================================================================
-- 10. CLIENTS TABLE
-- =====================================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  address text,
  city text,
  province text,
  postal_code text,
  country text,
  company_name text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  notes text,
  is_active boolean default true
);

create index if not exists clients_email_idx
  on public.clients (lower(email));

create index if not exists clients_name_idx
  on public.clients (lower(last_name), lower(first_name));

-- =====================================================================
-- 11. CLIENT ↔ TRAINER ASSIGNMENTS
-- =====================================================================
create table if not exists public.client_trainer_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references public.clients(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  assigned_date date default current_date,
  unassigned_date date
);

create index if not exists client_trainer_assignments_client_idx
  on public.client_trainer_assignments (client_id);

create index if not exists client_trainer_assignments_trainer_idx
  on public.client_trainer_assignments (trainer_id)
  where unassigned_date is null;

-- =====================================================================
-- 12. HOURS LOGGING TABLE
-- =====================================================================
create table if not exists public.hours (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  date date not null,
  day_of_week text not null,
  opening_time time,
  closing_time time,
  hours_worked numeric(6,2) default 0,
  is_closed boolean not null default false,
  status text not null default 'pending',
  notes text
);

create index if not exists hours_trainer_date_idx
  on public.hours (trainer_id, date desc);

alter table public.hours enable row level security;

drop policy if exists hours_owner_select on public.hours;
create policy hours_owner_select
  on public.hours for select
  using (
    trainer_id in (select id from public.trainers where user_id = auth.uid())
    or exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active is true
    )
  );

drop policy if exists hours_owner_insert on public.hours;
create policy hours_owner_insert
  on public.hours for insert
  with check (
    trainer_id in (select id from public.trainers where user_id = auth.uid())
  );

drop policy if exists hours_owner_update on public.hours;
create policy hours_owner_update
  on public.hours for update
  using (
    trainer_id in (select id from public.trainers where user_id = auth.uid())
    or exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active is true
    )
  )
  with check (
    trainer_id in (select id from public.trainers where user_id = auth.uid())
    or exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active is true
    )
  );

-- =====================================================================
-- 13. PAYROLL PERIODS & ENTRIES
-- =====================================================================
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  period_type text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft',
  total_amount numeric(12,2) not null default 0
);

create index if not exists payroll_periods_start_date_idx
  on public.payroll_periods (start_date desc);

create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  gross_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  status text not null default 'pending'
);

create index if not exists payroll_entries_period_idx
  on public.payroll_entries (payroll_period_id);

create index if not exists payroll_entries_trainer_idx
  on public.payroll_entries (trainer_id);

-- =====================================================================
-- 14. TRAINER PAYROLL (legacy summary)
-- =====================================================================
create table if not exists public.trainer_payroll (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending',
  period_start date,
  period_end date
);

create index if not exists trainer_payroll_trainer_idx
  on public.trainer_payroll (trainer_id);

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
