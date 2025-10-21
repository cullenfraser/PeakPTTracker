begin;

-- Private bucket for movement clips (no public read)
insert into storage.buckets (id, name, public)
values ('movement-clips', 'movement-clips', false)
on conflict (id) do nothing;

commit;
