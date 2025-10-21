-- Pulse (Monthly Check-in) schema
create extension if not exists pgcrypto;

-- Main table
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  date timestamptz default now(),
  cadence text not null default 'monthly' check (cadence = 'monthly'),
  -- header
  month_label text,
  trainer_name text,
  -- readiness & recovery
  energy_0_4 int,
  soreness_0_4 int,
  sleep_hours numeric,
  stress_0_4 int,
  -- attendance
  sessions_planned int,
  sessions_done int,
  attendance_pct numeric,
  -- consult tie-ins
  goals_update jsonb,
  pillars_json jsonb,
  parq_changes jsonb,
  -- screen follow-ups
  kpi_followups jsonb,
  -- body metrics
  weight_kg numeric,
  inbody_json jsonb,
  vitals_json jsonb,
  grip_best_kg numeric,
  -- planning
  next_month_planned_sessions int,
  schedule_changes jsonb,
  -- reflections & coach text
  win_text text,
  blocker_text text,
  trainer_notes text,
  -- computed & flags
  readiness_0_100 int,
  flags jsonb
);

-- Alerts for in-app reminders/flags
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  date timestamptz default now(),
  type text,
  severity text,
  message text,
  resolved boolean default false
);

-- History tables if they don't exist yet
create table if not exists public.inbody_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz default now(),
  weight_kg numeric,
  body_fat_pct numeric,
  skeletal_muscle_kg numeric,
  waist_cm numeric,
  waist_to_height numeric
);

create table if not exists public.vitals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz default now(),
  bp_sys int,
  bp_dia int,
  resting_hr int
);

create table if not exists public.grip_tests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz default now(),
  best_kg numeric
);

-- Indexes
create index if not exists idx_checkins_client_date on public.checkins(client_id, date desc);
create index if not exists idx_alerts_client_date on public.alerts(client_id, date desc);
create index if not exists idx_inbody_history_client on public.inbody_history(client_id, created_at desc);
create index if not exists idx_vitals_client on public.vitals(client_id, created_at desc);
create index if not exists idx_grip_tests_client on public.grip_tests(client_id, created_at desc);

-- RLS enable
alter table public.checkins enable row level security;
alter table public.alerts enable row level security;
alter table public.inbody_history enable row level security;
alter table public.vitals enable row level security;
alter table public.grip_tests enable row level security;

-- Policies: admins and trainers can read/write all rows (all clients)
-- checkins
do $policy$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='checkins' and policyname='checkins_select_admin') then
    execute $$ create policy checkins_select_admin on public.checkins for select using (
      exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='checkins' and policyname='checkins_select_trainer') then
    execute $$ create policy checkins_select_trainer on public.checkins for select using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='checkins' and policyname='checkins_write_admin') then
    execute $$ create policy checkins_write_admin on public.checkins for all using (
      exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) with check (
      exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='checkins' and policyname='checkins_write_trainer') then
    execute $$ create policy checkins_write_trainer on public.checkins for all using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid())
    ) with check (
      exists(select 1 from public.trainers t where t.user_id = auth.uid())
    ) $$;
  end if;
end$policy$;

-- alerts
do $policy$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='alerts_select_admin') then
    execute $$ create policy alerts_select_admin on public.alerts for select using (
      exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='alerts_select_trainer') then
    execute $$ create policy alerts_select_trainer on public.alerts for select using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='alerts_write_admin') then
    execute $$ create policy alerts_write_admin on public.alerts for all using (
      exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) with check (
      exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='alerts_write_trainer') then
    execute $$ create policy alerts_write_trainer on public.alerts for all using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid())
    ) with check (
      exists(select 1 from public.trainers t where t.user_id = auth.uid())
    ) $$;
  end if;
end$policy$;

-- inbody_history, vitals, grip_tests policies (read/write for admins/trainers)
-- inbody_history
create or replace view public._is_admin as select exists(select 1 from public.admin_users a where a.user_id = auth.uid()) as ok;
create or replace view public._is_trainer as select exists(select 1 from public.trainers t where t.user_id = auth.uid()) as ok;

do $policy$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inbody_history' and policyname='inbody_history_select_any_trainer_admin') then
    execute $$ create policy inbody_history_select_any_trainer_admin on public.inbody_history for select using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inbody_history' and policyname='inbody_history_write_trainer_admin') then
    execute $$ create policy inbody_history_write_trainer_admin on public.inbody_history for all using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) with check (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vitals' and policyname='vitals_select_trainer_admin') then
    execute $$ create policy vitals_select_trainer_admin on public.vitals for select using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vitals' and policyname='vitals_write_trainer_admin') then
    execute $$ create policy vitals_write_trainer_admin on public.vitals for all using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) with check (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
end$policy$;

-- grip_tests

do $policy$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='grip_tests' and policyname='grip_tests_select_trainer_admin') then
    execute $$ create policy grip_tests_select_trainer_admin on public.grip_tests for select using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='grip_tests' and policyname='grip_tests_write_trainer_admin') then
    execute $$ create policy grip_tests_write_trainer_admin on public.grip_tests for all using (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) with check (
      exists(select 1 from public.trainers t where t.user_id = auth.uid()) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
    ) $$;
  end if;
end$policy$;
