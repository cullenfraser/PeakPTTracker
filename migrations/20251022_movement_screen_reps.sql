-- Movement Screen rep-level insights support
begin;

alter table if exists movement_screen
  add column if not exists rep_summary_json jsonb,
  add column if not exists rep_insights_json jsonb;

commit;
