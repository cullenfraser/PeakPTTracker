-- Movement screen override metadata
begin;

alter table if exists movement_screen
  add column if not exists detected_variation_original text,
  add column if not exists coach_variation_override text;

commit;
