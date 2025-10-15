-- Add Square invoice number column and enhance notifications messaging

alter table public.contract_invoice_instances
  add column if not exists square_invoice_number text;

create or replace function public.fn_enqueue_invoice_notification()
returns trigger
language plpgsql
as $$
declare
  v_contract_number text;
  v_customer_name text;
  v_invoice_number text;
  v_invoice_label text;
  v_status text;
  v_prev_status text;
  v_message text;
begin
  v_status := lower(coalesce(new.status, ''));
  v_prev_status := lower(coalesce(old.status, ''));

  if v_status not in ('sent', 'paid') then
    return new;
  end if;

  if tg_op = 'update' and v_status = v_prev_status then
    return new;
  end if;

  select c.contract_number, c.customer_name
    into v_contract_number, v_customer_name
  from public.contracts c
  where c.id = new.contract_id;

  v_invoice_number := coalesce(new.square_invoice_number, new.square_invoice_id);
  v_invoice_label := coalesce(v_invoice_number, 'invoice');

  if v_status = 'sent' then
    v_message := format('%s invoice %s sent', coalesce(v_customer_name, 'Client'), v_invoice_label);
  else
    v_message := format('%s has paid %s', coalesce(v_customer_name, 'Client'), v_invoice_label);
  end if;

  insert into public.invoice_notifications (
    invoice_instance_id,
    contract_id,
    status,
    message,
    metadata
  )
  values (
    new.id,
    new.contract_id,
    v_status,
    v_message,
    jsonb_build_object(
      'installment_index', new.installment_index,
      'square_invoice_id', new.square_invoice_id,
      'square_invoice_number', new.square_invoice_number,
      'participant_contract_id', new.participant_contract_id
    )
  )
  on conflict (invoice_instance_id, status) do update
    set message = excluded.message,
        metadata = excluded.metadata,
        created_at = now();

  return new;
end;
$$;
