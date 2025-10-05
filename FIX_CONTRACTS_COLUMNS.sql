-- ============================================
-- FIX CONTRACTS TABLE - ADD MISSING COLUMNS
-- Run this before ADMIN_DASHBOARD_STEP1.sql
-- ============================================

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
  
  RAISE NOTICE '✅ Contracts table columns fixed!';
  RAISE NOTICE 'Added: start_date, end_date';
  RAISE NOTICE 'Now run: ADMIN_DASHBOARD_STEP1.sql';
END $$;
