-- =======================================================
-- MULTI-PARTICIPANT SUPPORT FOR QUOTES & CONTRACTS
-- =======================================================

BEGIN;

-- 1. Quote Participants ---------------------------------
CREATE TABLE IF NOT EXISTS public.quote_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  participant_index smallint NOT NULL CHECK (participant_index BETWEEN 1 AND 3),
  full_name text NOT NULL,
  email text,
  phone text,
  payment_share numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

-- Drop and recreate index to avoid conflicts
DROP INDEX IF EXISTS public.quote_participants_quote_id_idx;
CREATE UNIQUE INDEX quote_participants_quote_id_idx
  ON public.quote_participants (quote_id, participant_index);

ALTER TABLE public.quote_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage quote participants" ON public.quote_participants;
DROP POLICY IF EXISTS "Owner view quote participants" ON public.quote_participants;

CREATE POLICY "Admins manage quote participants" ON public.quote_participants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner view quote participants" ON public.quote_participants
  FOR SELECT
  USING (
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE created_by = auth.uid()
    )
  );

-- 2. Contract Participants ------------------------------
CREATE TABLE IF NOT EXISTS public.contract_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  participant_index smallint NOT NULL CHECK (participant_index BETWEEN 1 AND 3),
  full_name text NOT NULL,
  email text,
  phone text,
  payment_share numeric(10,2),
  square_customer_id text,
  square_invoice_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

-- Drop and recreate index to avoid conflicts
DROP INDEX IF EXISTS public.contract_participants_contract_id_idx;
CREATE UNIQUE INDEX contract_participants_contract_id_idx
  ON public.contract_participants (contract_id, participant_index);

ALTER TABLE public.contract_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage contract participants" ON public.contract_participants;
DROP POLICY IF EXISTS "Owner view contract participants" ON public.contract_participants;

CREATE POLICY "Admins manage contract participants" ON public.contract_participants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner view contract participants" ON public.contract_participants
  FOR SELECT
  USING (
    contract_id IN (
      SELECT id FROM public.contracts
      WHERE created_by = auth.uid()
    )
  );

-- 3. Add helper columns to quotes and contracts ----------
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS split_payment_amount numeric(10,2);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS split_payment_amount numeric(10,2);

COMMIT;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Multi-Participant Support Added!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📊 Tables: quote_participants, contract_participants';
  RAISE NOTICE '💰 Columns: split_payment_amount';
  RAISE NOTICE '🔒 RLS policies configured';
END $$;
