-- =======================================================
-- PARTICIPANT CONTRACTS MIGRATION
-- =======================================================

BEGIN;

-- 1. Parent contract progress counters
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS participant_contract_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS participant_contract_signed_count integer DEFAULT 0;

-- 2. Participant-specific contract table
CREATE TABLE IF NOT EXISTS public.participant_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  participant_id uuid,
  participant_index integer NOT NULL,
  participant_name text NOT NULL,
  participant_email text,
  participant_phone text,
  payment_share numeric(12,2) DEFAULT 0,
  discount_percent numeric(5,2) DEFAULT 0,
  contract_number text NOT NULL,
  contract_payload jsonb NOT NULL,
  price_per_session numeric(12,2) NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  tax_amount numeric(12,2) NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  payment_schedule text NOT NULL,
  payment_method text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'pending',
  signature_data text,
  signed_date timestamptz,
  signer_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Helpful indexes
CREATE INDEX IF NOT EXISTS participant_contracts_contract_id_idx ON public.participant_contracts(contract_id);
CREATE INDEX IF NOT EXISTS participant_contracts_status_idx ON public.participant_contracts(status);
CREATE INDEX IF NOT EXISTS participant_contracts_participant_index_idx ON public.participant_contracts(participant_index);

-- 4. Enable Row Level Security
ALTER TABLE public.participant_contracts ENABLE ROW LEVEL SECURITY;

-- 5. Policies (owner-based access)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'participant_contracts' AND policyname = 'participant_contracts_owner_select'
  ) THEN
    CREATE POLICY participant_contracts_owner_select
      ON public.participant_contracts
      USING (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'participant_contracts' AND policyname = 'participant_contracts_owner_insert'
  ) THEN
    CREATE POLICY participant_contracts_owner_insert
      ON public.participant_contracts
      FOR INSERT
      WITH CHECK (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'participant_contracts' AND policyname = 'participant_contracts_owner_update'
  ) THEN
    CREATE POLICY participant_contracts_owner_update
      ON public.participant_contracts
      FOR UPDATE
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE 'Participant contract infrastructure created.';
END $$;

-- =======================================================
-- CONTRACT SIGNATURES TABLE
-- =======================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  participant_contract_id uuid REFERENCES public.participant_contracts(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_role text DEFAULT 'participant',
  signature_data text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signer_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS contract_signatures_contract_id_idx ON public.contract_signatures(contract_id);
CREATE INDEX IF NOT EXISTS contract_signatures_participant_contract_id_idx ON public.contract_signatures(participant_contract_id);

ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contract_signatures' AND policyname = 'contract_signatures_owner_select'
  ) THEN
    CREATE POLICY contract_signatures_owner_select
      ON public.contract_signatures
      USING (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contract_signatures' AND policyname = 'contract_signatures_owner_insert'
  ) THEN
    CREATE POLICY contract_signatures_owner_insert
      ON public.contract_signatures
      FOR INSERT
      WITH CHECK (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contract_signatures' AND policyname = 'contract_signatures_owner_update'
  ) THEN
    CREATE POLICY contract_signatures_owner_update
      ON public.contract_signatures
      FOR UPDATE
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE 'Contract signatures table ensured.';
END $$;
