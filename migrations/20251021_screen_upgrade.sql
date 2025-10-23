-- Screen Upgrade: variation detection + KPI + briefing persistence
begin;

-- Extend movement_screen with additional fields
alter table if exists movement_screen
  add column if not exists coach_id uuid,
  add column if not exists detected_variation text,
  add column if not exists camera_view text,
  add column if not exists overall_pass boolean,
  add column if not exists priority_json jsonb,
  add column if not exists model_json jsonb,
  add column if not exists storage_path text,
  add column if not exists clip_duration_s int;

-- Extend movement_kpi_logs with richer fields
alter table if exists movement_kpi_logs
  add column if not exists client_id uuid,
  add column if not exists kpi_name text,
  add column if not exists frame_refs jsonb;

commit;
