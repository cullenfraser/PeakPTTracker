begin;

alter table movement_kpi_logs
  add column if not exists pass_original boolean,
  add column if not exists pass_override boolean;

commit;
