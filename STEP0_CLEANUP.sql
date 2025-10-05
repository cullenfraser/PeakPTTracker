-- ============================================
-- STEP 0: CLEANUP - Run this FIRST
-- This removes old tables/triggers that have wrong structure
-- ============================================

-- Drop all triggers first
DROP TRIGGER IF EXISTS create_client_trigger ON contracts;
DROP TRIGGER IF EXISTS update_completed_sessions_trigger ON training_sessions;

-- Drop all functions
DROP FUNCTION IF EXISTS create_client_from_contract() CASCADE;
DROP FUNCTION IF EXISTS update_completed_sessions_count() CASCADE;

-- Drop all RLS policies (ignore errors if tables don't exist)
DO $$
BEGIN
  -- Admin users policies
  DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users;
  DROP POLICY IF EXISTS "Super admins can manage admin users" ON admin_users;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  -- Trainers policies
  DROP POLICY IF EXISTS "Everyone can view trainers" ON trainers;
  DROP POLICY IF EXISTS "Admins can manage trainers" ON trainers;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  -- Clients policies
  DROP POLICY IF EXISTS "Admins can view all clients" ON clients;
  DROP POLICY IF EXISTS "Trainers can view assigned clients" ON clients;
  DROP POLICY IF EXISTS "Admins can manage clients" ON clients;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  -- Quotes policies
  DROP POLICY IF EXISTS "Users can view own quotes" ON quotes;
  DROP POLICY IF EXISTS "Admins can view all quotes" ON quotes;
  DROP POLICY IF EXISTS "Users can create quotes" ON quotes;
  DROP POLICY IF EXISTS "Admins can manage quotes" ON quotes;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  -- Contracts policies
  DROP POLICY IF EXISTS "Admins can view all contracts" ON contracts;
  DROP POLICY IF EXISTS "Trainers can view assigned contracts" ON contracts;
  DROP POLICY IF EXISTS "Users can view own contracts" ON contracts;
  DROP POLICY IF EXISTS "Admins can manage contracts" ON contracts;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  -- Training sessions policies
  DROP POLICY IF EXISTS "Admins can view all sessions" ON training_sessions;
  DROP POLICY IF EXISTS "Trainers can view own sessions" ON training_sessions;
  DROP POLICY IF EXISTS "Admins can insert sessions" ON training_sessions;
  DROP POLICY IF EXISTS "Trainers can insert own sessions" ON training_sessions;
  DROP POLICY IF EXISTS "Admins can update all sessions" ON training_sessions;
  DROP POLICY IF EXISTS "Trainers can update own sessions" ON training_sessions;
  DROP POLICY IF EXISTS "Admins can delete sessions" ON training_sessions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  -- Client trainer assignments policies
  DROP POLICY IF EXISTS "Admins can view all assignments" ON client_trainer_assignments;
  DROP POLICY IF EXISTS "Trainers can view own assignments" ON client_trainer_assignments;
  DROP POLICY IF EXISTS "Admins can manage assignments" ON client_trainer_assignments;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  -- Hours policies
  DROP POLICY IF EXISTS "Admins can view all hours" ON hours;
  DROP POLICY IF EXISTS "Trainers can view own hours" ON hours;
  DROP POLICY IF EXISTS "Trainers can insert own hours" ON hours;
  DROP POLICY IF EXISTS "Admins can manage hours" ON hours;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop tables in reverse order (respecting foreign keys)
DROP TABLE IF EXISTS hours CASCADE;
DROP TABLE IF EXISTS client_trainer_assignments CASCADE;
DROP TABLE IF EXISTS training_sessions CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS trainers CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ CLEANUP COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All old tables, triggers, and policies removed.';
  RAISE NOTICE 'Next: Run STEP1_CREATE_TABLES.sql';
END $$;
