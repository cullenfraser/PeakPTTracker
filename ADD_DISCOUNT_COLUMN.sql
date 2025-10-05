-- =======================================================
-- ADD DISCOUNT_PERCENT COLUMN TO QUOTES AND CONTRACTS
-- =======================================================

BEGIN;

-- Add discount_percent column to quotes table
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0;

-- Add discount_percent column to contracts table
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0;

-- Add payment_amount column to contracts table
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS payment_amount numeric(12,2) DEFAULT 0;

-- Update existing records to have 0 discount if NULL
UPDATE public.quotes SET discount_percent = 0 WHERE discount_percent IS NULL;
UPDATE public.contracts SET discount_percent = 0 WHERE discount_percent IS NULL;
UPDATE public.contracts SET payment_amount = 0 WHERE payment_amount IS NULL;

COMMIT;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Discount Column Added Successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Added discount_percent to quotes';
  RAISE NOTICE 'Added discount_percent to contracts';
  RAISE NOTICE 'All existing records set to 0%% discount';
END $$;
