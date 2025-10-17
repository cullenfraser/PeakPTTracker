-- Elevation Map scaffolding migration
-- Creates movement screening tables and elevation map snapshot storage.

begin;

create table if not exists movement_screen (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  pattern text not null check (pattern in ('Squat','Lunge','Hinge','Push','Pull')),
  overall_score_0_3 smallint not null check (overall_score_0_3 between 0 and 3),
  priority_order jsonb not null,
  gemini_json jsonb not null,
  notes text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists movement_screen_client_pattern_idx on movement_screen (client_id, pattern, recorded_at desc);

create table if not exists movement_kpi_logs (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references movement_screen(id) on delete cascade,
  key text not null,
  pass boolean not null,
  score_0_3 smallint not null check (score_0_3 between 0 and 3),
  why text not null,
  cues text[] not null,
  regression text,
  progression text,
  confidence double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists movement_kpi_logs_screen_idx on movement_kpi_logs (screen_id);

create table if not exists movement_features_raw (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references movement_screen(id) on delete cascade,
  feature_payload jsonb not null,
  thumbnails text[],
  created_at timestamptz not null default now()
);

create table if not exists movement_clips (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references movement_screen(id) on delete cascade,
  storage_path text not null,
  duration_s double precision,
  fps double precision,
  created_at timestamptz not null default now()
);

create table if not exists elevation_map_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  tiles jsonb not null,
  priorities jsonb not null,
  plan jsonb,
  created_at timestamptz not null default now()
);

create index if not exists elevation_map_snapshots_client_idx on elevation_map_snapshots (client_id, created_at desc);

create table if not exists elevation_milestones (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'open',
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists elevation_milestones_client_idx on elevation_milestones (client_id, due_date);

commit;
