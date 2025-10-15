-- Create invoice notifications table and trigger for sent/paid events

create table if not exists public.invoice_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_instance_id uuid not null references public.contract_invoice_instances(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  status text not null check (status in ('sent','paid')),
  message text not null,
  read_at timestamptz null,
  metadata jsonb null
);

-- Avoid duplicates for the same invoice/status
create unique index if not exists invoice_notifications_unique
  on public.invoice_notifications (invoice_instance_id, status);

-- Helper function to format message and insert notification
create or replace function public.fn_enqueue_invoice_notification()
returns trigger
language plpgsql
as $$
declare
  v_contract_number text;
  v_customer_name text;
  v_status text;
  v_message text;
  v_status_prev text;
begin
  v_status := lower(coalesce(NEW.status, ''));
  v_status_prev := lower(coalesce(OLD.status, ''));

  -- Only act on new sent/paid or a status change into sent/paid
  if v_status not in ('sent','paid') then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and v_status = v_status_prev then
    return NEW;
  end if;

  select c.contract_number, c.customer_name
    into v_contract_number, v_customer_name
  from public.contracts c
  where c.id = NEW.contract_id;

  if v_status = 'sent' then
    v_message := coalesce(v_customer_name, 'Client') || ' invoice sent';
  else
    v_message := coalesce(v_customer_name, 'Client') || ' has paid invoice';
  end if;

  insert into public.invoice_notifications (invoice_instance_id, contract_id, status, message, metadata)
  values (NEW.id, NEW.contract_id, v_status, v_message, jsonb_build_object(
    'installment_index', NEW.installment_index,
    'square_invoice_id', NEW.square_invoice_id,
    'participant_contract_id', NEW.participant_contract_id
  ))
  on conflict (invoice_instance_id, status) do nothing;

  return NEW;
end;
$$;

-- Trigger on insert/update of invoice instances
create trigger trg_contract_invoice_instances_notify
after insert or update of status
on public.contract_invoice_instances
for each row
execute function public.fn_enqueue_invoice_notification();
