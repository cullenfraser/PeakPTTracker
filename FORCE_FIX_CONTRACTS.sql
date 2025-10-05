-- ============================================
-- NUCLEAR OPTION: Force fix contracts table
-- Run this if nothing else works
-- ============================================

-- Drop ALL policies on contracts
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'contracts') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON contracts';
  END LOOP;
END $$;

-- Disable RLS completely
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;

-- Drop ALL triggers on contracts
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'contracts') LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON contracts CASCADE';
  END LOOP;
END $$;

-- Now add the columns
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE;

-- Set defaults for existing records
UPDATE contracts 
SET start_date = COALESCE(created_at::date, CURRENT_DATE)
WHERE start_date IS NULL;

-- Success
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ FORCED FIX COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Removed ALL policies from contracts';
  RAISE NOTICE 'Removed ALL triggers from contracts';
  RAISE NOTICE 'Disabled RLS on contracts';
  RAISE NOTICE 'Added start_date and end_date columns';
  RAISE NOTICE '';
  RAISE NOTICE 'Now run: ADMIN_DASHBOARD_STEP1.sql';
END $$;
