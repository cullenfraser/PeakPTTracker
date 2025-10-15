-- =======================================================
-- CONTRACT INVOICE INSTANCES TABLE
-- =======================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_invoice_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  participant_contract_id uuid NOT NULL REFERENCES public.participant_contracts(id) ON DELETE CASCADE,
  square_customer_id text,
  square_invoice_id text,
  square_public_url text,
  installment_index integer NOT NULL,
  installment_total_cents integer NOT NULL,
  participant_share_cents integer NOT NULL,
  due_date date NOT NULL,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb,
  UNIQUE (participant_contract_id, installment_index)
);

CREATE INDEX IF NOT EXISTS contract_invoice_instances_contract_id_idx
  ON public.contract_invoice_instances(contract_id);

CREATE INDEX IF NOT EXISTS contract_invoice_instances_participant_idx
  ON public.contract_invoice_instances(participant_contract_id);

ALTER TABLE public.contract_invoice_instances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contract_invoice_instances'
      AND policyname = 'contract_invoice_instances_owner_select'
  ) THEN
    CREATE POLICY contract_invoice_instances_owner_select
      ON public.contract_invoice_instances
      USING (
        EXISTS (
          SELECT 1
          FROM public.contracts c
          WHERE c.id = contract_invoice_instances.contract_id
            AND c.created_by = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contract_invoice_instances'
      AND policyname = 'contract_invoice_instances_owner_insert'
  ) THEN
    CREATE POLICY contract_invoice_instances_owner_insert
      ON public.contract_invoice_instances
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.contracts c
          WHERE c.id = contract_invoice_instances.contract_id
            AND c.created_by = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contract_invoice_instances'
      AND policyname = 'contract_invoice_instances_owner_update'
  ) THEN
    CREATE POLICY contract_invoice_instances_owner_update
      ON public.contract_invoice_instances
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.contracts c
          WHERE c.id = contract_invoice_instances.contract_id
            AND c.created_by = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.contracts c
          WHERE c.id = contract_invoice_instances.contract_id
            AND c.created_by = auth.uid()
        )
      );
  END IF;
END $$;

COMMIT;
