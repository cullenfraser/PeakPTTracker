-- ============================================
-- ADMIN DASHBOARD STEP 0: CLEANUP & PREP
-- Run this FIRST before STEP1
-- ============================================

-- Drop RLS policies on contracts (they might reference start_date)
DROP POLICY IF EXISTS "Admins can view all contracts" ON contracts;
DROP POLICY IF EXISTS "Trainers can view assigned contracts" ON contracts;
DROP POLICY IF EXISTS "Users can view own contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can manage contracts" ON contracts;

-- Temporarily disable RLS to avoid policy issues
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;

-- Drop any existing triggers on contracts that might cause issues
DROP TRIGGER IF EXISTS create_client_trigger ON contracts;
DROP TRIGGER IF EXISTS update_completed_sessions_trigger ON training_sessions;

-- Drop existing functions that might reference old columns
DROP FUNCTION IF EXISTS create_client_from_contract() CASCADE;
DROP FUNCTION IF EXISTS update_completed_sessions_count() CASCADE;

-- Add missing columns to contracts table
DO $$
BEGIN
  -- Add start_date if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE contracts ADD COLUMN start_date DATE;
    
    -- Set default value for existing contracts
    UPDATE contracts
    SET start_date = COALESCE(created_at::date, CURRENT_DATE)
    WHERE start_date IS NULL;
  END IF;
  
  -- Add end_date if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'end_date'
  ) THEN
    ALTER TABLE contracts ADD COLUMN end_date DATE;
  END IF;
END $$;

-- Note: RLS is now disabled. It will be re-enabled with new policies in STEP2

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ STEP 0 COMPLETE: Ready for admin dashboard!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Dropped contracts RLS policies';
  RAISE NOTICE 'Disabled RLS on contracts (will be re-enabled in STEP2)';
  RAISE NOTICE 'Dropped old triggers and functions';
  RAISE NOTICE 'Added: start_date, end_date to contracts';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: After completing all steps, run STEP2_TRIGGERS_AND_POLICIES.sql';
  RAISE NOTICE '    to recreate contracts table triggers and RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Run ADMIN_DASHBOARD_STEP1.sql';
END $$;
