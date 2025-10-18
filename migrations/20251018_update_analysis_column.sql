begin;

alter table movement_screen
  add column if not exists analysis_json jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'movement_screen'
      and column_name = 'gemini_json'
  ) then
    update movement_screen
      set analysis_json = gemini_json
      where analysis_json is null;
  end if;
end $$;

alter table movement_screen
  alter column analysis_json set not null;

alter table movement_screen
  drop column if exists gemini_json;

commit;
