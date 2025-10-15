-- Create table for per-client trainer session splits (active set via effective_to IS NULL)
create table if not exists public.client_trainer_session_splits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null,
  client_id uuid not null references public.clients(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete restrict,
  allocated_sessions integer not null check (allocated_sessions >= 0),
  effective_from date not null default (now()::date),
  effective_to date null,
  notes text null
);

-- One active split per client+trainer
create unique index if not exists uq_client_trainer_active_split
on public.client_trainer_session_splits (client_id, trainer_id)
where effective_to is null;

-- Helpful view for current active split
create or replace view public.client_current_trainer_splits as
select s.id,
       s.client_id,
       s.trainer_id,
       s.allocated_sessions,
       s.effective_from,
       s.notes
from public.client_trainer_session_splits s
where s.effective_to is null;

-- Basic RLS passthrough (adjust as needed)
alter table public.client_trainer_session_splits enable row level security;

-- Policies: allow service role and admins to read/write
-- NOTE: If you already manage admin via admin_users, you can refine these
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'client_trainer_session_splits'
      and policyname = 'cts read for authenticated'
  ) then
    create policy "cts read for authenticated"
      on public.client_trainer_session_splits
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'client_trainer_session_splits'
      and policyname = 'cts modify for service role'
  ) then
    create policy "cts modify for service role"
      on public.client_trainer_session_splits
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
