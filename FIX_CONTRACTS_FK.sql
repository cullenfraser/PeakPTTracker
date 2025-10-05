-- ============================================
-- Drop and recreate contracts foreign keys
-- ============================================

-- Find and drop all foreign keys TO contracts
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT 
      tc.table_name, 
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu 
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'contracts'
  ) LOOP
    EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT IF EXISTS ' || r.constraint_name;
    RAISE NOTICE 'Dropped FK: %.%', r.table_name, r.constraint_name;
  END LOOP;
END $$;

-- Now try running ADMIN_DASHBOARD_STEP1.sql
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Foreign keys to contracts dropped!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Now run: ADMIN_DASHBOARD_STEP1.sql';
END $$;
