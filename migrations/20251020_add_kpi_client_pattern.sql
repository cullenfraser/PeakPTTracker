begin;

alter table public.movement_kpi_logs
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists pattern text;

create index if not exists movement_kpi_logs_client_created_idx on public.movement_kpi_logs (client_id, created_at desc);

commit;
