-- ============================================
-- NUCLEAR CLEANUP - Drop ALL triggers and policies
-- Run this BEFORE ADMIN_DASHBOARD_STEP1.sql
-- ============================================

-- Drop ALL views and materialized views
DO $$ 
DECLARE
  r RECORD;
BEGIN
  -- Drop all views
  FOR r IN (
    SELECT table_name 
    FROM information_schema.views 
    WHERE table_schema = 'public'
  ) LOOP
    EXECUTE 'DROP VIEW IF EXISTS ' || r.table_name || ' CASCADE';
  END LOOP;
  
  -- Drop all materialized views
  FOR r IN (
    SELECT matviewname 
    FROM pg_matviews 
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS ' || r.matviewname || ' CASCADE';
  END LOOP;
END $$;

-- Drop ALL functions that might reference contracts
DROP FUNCTION IF EXISTS create_client_from_contract() CASCADE;
DROP FUNCTION IF EXISTS update_completed_sessions_count() CASCADE;
DROP FUNCTION IF EXISTS calculate_payroll_entry_totals() CASCADE;
DROP FUNCTION IF EXISTS update_payroll_period_total() CASCADE;

-- Drop policies on ALL tables
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON ' || r.tablename;
  END LOOP;
END $$;

-- Disable RLS on all tables
ALTER TABLE IF EXISTS admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trainers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS quotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contracts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS training_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_trainer_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS hours DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payroll_periods DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payroll_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bonuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments DISABLE ROW LEVEL SECURITY;

-- Drop ALL triggers
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT trigger_name, event_object_table 
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public'
    AND event_object_table IN ('contracts', 'training_sessions', 'payroll_entries', 'clients', 'trainers')
  ) LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON ' || r.event_object_table || ' CASCADE';
  END LOOP;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ NUCLEAR CLEANUP COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Dropped ALL views and materialized views';
  RAISE NOTICE 'Dropped ALL functions';
  RAISE NOTICE 'Dropped ALL policies';
  RAISE NOTICE 'Disabled RLS on ALL tables';
  RAISE NOTICE 'Dropped ALL triggers';
  RAISE NOTICE '';
  RAISE NOTICE 'Now run: ADMIN_DASHBOARD_STEP1.sql';
END $$;
