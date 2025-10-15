-- Elevate feature schema and RLS
-- Requires pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- 01_sessions
create table if not exists public.elevate_session (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  created_at timestamptz default now(),
  clearance_level text check (clearance_level in ('needs_clearance','cleared_light_mod','cleared_all')),
  ex numeric,
  nu numeric,
  sl numeric,
  st numeric,
  peak numeric,
  health_age numeric,
  health_age_delta numeric,
  created_by uuid
);

-- 02_parq
create table if not exists public.elevate_parq (
  session_id uuid primary key references public.elevate_session(id) on delete cascade,
  chest_pain bool,
  dizziness bool,
  dx_condition bool,
  sob_mild bool,
  joint_issue bool,
  balance_neuro bool,
  uncontrolled_bp_dm text,
  recent_surgery bool,
  pregnancy_postpartum text,
  clearance_level text
);

-- 03_food_env
create table if not exists public.elevate_food_env (
  session_id uuid primary key references public.elevate_session(id) on delete cascade,
  home_cook_0_4 int check (home_cook_0_4 between 0 and 4),
  upf_home_0_4 int check (upf_home_0_4 between 0 and 4),
  fe_score int
);

-- 04_grip
create table if not exists public.elevate_grip (
  session_id uuid primary key references public.elevate_session(id) on delete cascade,
  best_left_kgf numeric,
  best_right_kgf numeric,
  sum_best_kgf numeric,
  rel_grip numeric,
  grip_z numeric,
  grip_score int
);

-- 05_answers
create table if not exists public.elevate_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.elevate_session(id) on delete cascade,
  pillar text check (pillar in ('EX','NU','SL','ST')),
  item_code text,
  value_raw jsonb,
  score_0_4 int check (score_0_4 between 0 and 4)
);

-- 06_projection
create table if not exists public.elevate_projection (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.elevate_session(id) on delete cascade,
  horizon text check (horizon in ('6mo','1y','2y','3y','4y','5y','10y')),
  scenario text check (scenario in ('no_change','with_change')),
  weight_kg numeric,
  bodyfat_pct numeric,
  smm_kg numeric,
  whtR numeric,
  vat_level int,
  ex numeric,
  nu numeric,
  sl numeric,
  st numeric,
  peak numeric,
  health_age numeric,
  health_age_delta numeric
);

-- 07_risk
create table if not exists public.elevate_risk (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.elevate_session(id) on delete cascade,
  horizon text,
  scenario text,
  condition text check (condition in ('t2d','osa','htn','nafld','sarcopenia','lowcrf')),
  risk_score int check (risk_score between 0 and 100),
  band text check (band in ('Low','Mod','High','Very High')),
  top_drivers_json jsonb
);

-- 08_whatif
create table if not exists public.elevate_whatif (
  session_id uuid primary key references public.elevate_session(id) on delete cascade,
  w int check (w between 1 and 7),
  adherence numeric check (adherence between 0 and 1),
  protein_support numeric check (protein_support between 0.5 and 1),
  sleep_support numeric check (sleep_support between 0.5 and 1)
);

-- 09_goals
create table if not exists public.elevate_goals (
  session_id uuid primary key references public.elevate_session(id) on delete cascade,
  goal_type text,
  specific text,
  measurable text,
  achievable text,
  relevant text,
  time_bound text,
  non_negs jsonb,
  horizon text,
  workouts_per_week int
);

-- RLS: enable and policies
alter table public.elevate_session enable row level security;
alter table public.elevate_parq enable row level security;
alter table public.elevate_food_env enable row level security;
alter table public.elevate_grip enable row level security;
alter table public.elevate_answers enable row level security;
alter table public.elevate_projection enable row level security;
alter table public.elevate_risk enable row level security;
alter table public.elevate_whatif enable row level security;
alter table public.elevate_goals enable row level security;

-- Helpers
-- is_trainer: user has a trainers row
create or replace view public._elevate_is_trainer as
  select true as ok
  where exists (select 1 from public.trainers t where t.user_id = auth.uid());

-- Policies for elevate_session
do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_session' and policyname = 'elevate_session_select_trainer'
  ) then
    execute $sql$
      create policy elevate_session_select_trainer on public.elevate_session
        for select using (
          exists(select 1 from public.trainers t where t.user_id = auth.uid())
        )
    $sql$;
  end if;
end$policy$;

-- Admin policies: allow admins to select and write across all elevate tables
do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_session' and policyname='elevate_session_select_admin'
  ) then
    execute $sql$
      create policy elevate_session_select_admin on public.elevate_session
        for select using (
          exists(select 1 from public.admin_users a where a.user_id = auth.uid())
        )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_session' and policyname='elevate_session_write_admin'
  ) then
    execute $sql$
      create policy elevate_session_write_admin on public.elevate_session
        for all using (
          exists(select 1 from public.admin_users a where a.user_id = auth.uid())
        ) with check (
          exists(select 1 from public.admin_users a where a.user_id = auth.uid())
        )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  -- elevate_parq
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_parq' and policyname='elevate_parq_select_admin'
  ) then
    execute $sql$
      create policy elevate_parq_select_admin on public.elevate_parq for select using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_parq' and policyname='elevate_parq_write_admin'
  ) then
    execute $sql$
      create policy elevate_parq_write_admin on public.elevate_parq for all using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;

  -- elevate_food_env
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_food_env' and policyname='elevate_food_env_select_admin'
  ) then
    execute $sql$
      create policy elevate_food_env_select_admin on public.elevate_food_env for select using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_food_env' and policyname='elevate_food_env_write_admin'
  ) then
    execute $sql$
      create policy elevate_food_env_write_admin on public.elevate_food_env for all using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;

  -- elevate_grip
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_grip' and policyname='elevate_grip_select_admin'
  ) then
    execute $sql$
      create policy elevate_grip_select_admin on public.elevate_grip for select using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_grip' and policyname='elevate_grip_write_admin'
  ) then
    execute $sql$
      create policy elevate_grip_write_admin on public.elevate_grip for all using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;

  -- elevate_answers
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_answers' and policyname='elevate_answers_select_admin'
  ) then
    execute $sql$
      create policy elevate_answers_select_admin on public.elevate_answers for select using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_answers' and policyname='elevate_answers_write_admin'
  ) then
    execute $sql$
      create policy elevate_answers_write_admin on public.elevate_answers for all using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;

  -- elevate_projection
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_projection' and policyname='elevate_projection_select_admin'
  ) then
    execute $sql$
      create policy elevate_projection_select_admin on public.elevate_projection for select using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_projection' and policyname='elevate_projection_write_admin'
  ) then
    execute $sql$
      create policy elevate_projection_write_admin on public.elevate_projection for all using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;

  -- elevate_risk
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_risk' and policyname='elevate_risk_select_admin'
  ) then
    execute $sql$
      create policy elevate_risk_select_admin on public.elevate_risk for select using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_risk' and policyname='elevate_risk_write_admin'
  ) then
    execute $sql$
      create policy elevate_risk_write_admin on public.elevate_risk for all using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;

  -- elevate_whatif
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_whatif' and policyname='elevate_whatif_select_admin'
  ) then
    execute $sql$
      create policy elevate_whatif_select_admin on public.elevate_whatif for select using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_whatif' and policyname='elevate_whatif_write_admin'
  ) then
    execute $sql$
      create policy elevate_whatif_write_admin on public.elevate_whatif for all using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;

  -- elevate_goals
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_goals' and policyname='elevate_goals_select_admin'
  ) then
    execute $sql$
      create policy elevate_goals_select_admin on public.elevate_goals for select using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='elevate_goals' and policyname='elevate_goals_write_admin'
  ) then
    execute $sql$
      create policy elevate_goals_write_admin on public.elevate_goals for all using (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.admin_users a where a.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_session' and policyname = 'elevate_session_select_client'
  ) then
    execute $sql$
      create policy elevate_session_select_client on public.elevate_session
        for select using (
          exists(
            select 1
            from public.clients c
            where c.id = elevate_session.client_id
              and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
          )
        )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_session' and policyname = 'elevate_session_write_trainer'
  ) then
    execute $sql$
      create policy elevate_session_write_trainer on public.elevate_session
        for all using (
          exists(select 1 from public.trainers t where t.user_id = auth.uid())
        ) with check (
          exists(select 1 from public.trainers t where t.user_id = auth.uid())
        )
    $sql$;
  end if;
end$policy$;

-- Policies for child tables: trainers can select/write; client can select based on session ownership
do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_parq' and policyname = 'elevate_child_select_trainer'
  ) then
    execute $sql$
      create policy elevate_child_select_trainer on public.elevate_parq for select using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_parq' and policyname = 'elevate_child_select_client'
  ) then
    execute $sql$
      create policy elevate_child_select_client on public.elevate_parq for select using (
        exists(select 1 from public.elevate_session s join public.clients c on c.id = s.client_id where s.id = elevate_parq.session_id and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text,'')))
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_parq' and policyname = 'elevate_child_write_trainer'
  ) then
    execute $sql$
      create policy elevate_child_write_trainer on public.elevate_parq for all using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;

-- Duplicate for other child tables
do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_food_env' and policyname = 'elevate_child_select_trainer_food'
  ) then
    execute $sql$
      create policy elevate_child_select_trainer_food on public.elevate_food_env for select using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_food_env' and policyname = 'elevate_child_select_client_food'
  ) then
    execute $sql$
      create policy elevate_child_select_client_food on public.elevate_food_env for select using (
        exists(select 1 from public.elevate_session s join public.clients c on c.id = s.client_id where s.id = elevate_food_env.session_id and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text,'')))
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_food_env' and policyname = 'elevate_child_write_trainer_food'
  ) then
    execute $sql$
      create policy elevate_child_write_trainer_food on public.elevate_food_env for all using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_grip' and policyname = 'elevate_child_select_trainer_grip'
  ) then
    execute $sql$
      create policy elevate_child_select_trainer_grip on public.elevate_grip for select using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_grip' and policyname = 'elevate_child_select_client_grip'
  ) then
    execute $sql$
      create policy elevate_child_select_client_grip on public.elevate_grip for select using (
        exists(select 1 from public.elevate_session s join public.clients c on c.id = s.client_id where s.id = elevate_grip.session_id and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text,'')))
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_grip' and policyname = 'elevate_child_write_trainer_grip'
  ) then
    execute $sql$
      create policy elevate_child_write_trainer_grip on public.elevate_grip for all using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_answers' and policyname = 'elevate_child_select_trainer_ans'
  ) then
    execute $sql$
      create policy elevate_child_select_trainer_ans on public.elevate_answers for select using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_answers' and policyname = 'elevate_child_select_client_ans'
  ) then
    execute $sql$
      create policy elevate_child_select_client_ans on public.elevate_answers for select using (
        exists(select 1 from public.elevate_session s join public.clients c on c.id = s.client_id where s.id = elevate_answers.session_id and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text,'')))
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_answers' and policyname = 'elevate_child_write_trainer_ans'
  ) then
    execute $sql$
      create policy elevate_child_write_trainer_ans on public.elevate_answers for all using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_projection' and policyname = 'elevate_child_select_trainer_proj'
  ) then
    execute $sql$
      create policy elevate_child_select_trainer_proj on public.elevate_projection for select using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_projection' and policyname = 'elevate_child_select_client_proj'
  ) then
    execute $sql$
      create policy elevate_child_select_client_proj on public.elevate_projection for select using (
        exists(select 1 from public.elevate_session s join public.clients c on c.id = s.client_id where s.id = elevate_projection.session_id and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text,'')))
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_projection' and policyname = 'elevate_child_write_trainer_proj'
  ) then
    execute $sql$
      create policy elevate_child_write_trainer_proj on public.elevate_projection for all using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_risk' and policyname = 'elevate_child_select_trainer_risk'
  ) then
    execute $sql$
      create policy elevate_child_select_trainer_risk on public.elevate_risk for select using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_risk' and policyname = 'elevate_child_select_client_risk'
  ) then
    execute $sql$
      create policy elevate_child_select_client_risk on public.elevate_risk for select using (
        exists(select 1 from public.elevate_session s join public.clients c on c.id = s.client_id where s.id = elevate_risk.session_id and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text,'')))
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_risk' and policyname = 'elevate_child_write_trainer_risk'
  ) then
    execute $sql$
      create policy elevate_child_write_trainer_risk on public.elevate_risk for all using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_whatif' and policyname = 'elevate_child_select_trainer_whatif'
  ) then
    execute $sql$
      create policy elevate_child_select_trainer_whatif on public.elevate_whatif for select using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_whatif' and policyname = 'elevate_child_select_client_whatif'
  ) then
    execute $sql$
      create policy elevate_child_select_client_whatif on public.elevate_whatif for select using (
        exists(select 1 from public.elevate_session s join public.clients c on c.id = s.client_id where s.id = elevate_whatif.session_id and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text,'')))
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_whatif' and policyname = 'elevate_child_write_trainer_whatif'
  ) then
    execute $sql$
      create policy elevate_child_write_trainer_whatif on public.elevate_whatif for all using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;

do $policy$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_goals' and policyname = 'elevate_child_select_trainer_goals'
  ) then
    execute $sql$
      create policy elevate_child_select_trainer_goals on public.elevate_goals for select using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_goals' and policyname = 'elevate_child_select_client_goals'
  ) then
    execute $sql$
      create policy elevate_child_select_client_goals on public.elevate_goals for select using (
        exists(select 1 from public.elevate_session s join public.clients c on c.id = s.client_id where s.id = elevate_goals.session_id and lower(c.email) = lower(coalesce((auth.jwt() ->> 'email')::text,'')))
      )
    $sql$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elevate_goals' and policyname = 'elevate_child_write_trainer_goals'
  ) then
    execute $sql$
      create policy elevate_child_write_trainer_goals on public.elevate_goals for all using (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      ) with check (
        exists(select 1 from public.trainers t where t.user_id = auth.uid())
      )
    $sql$;
  end if;
end$policy$;
