-- ============================================
-- ADMIN DASHBOARD DROP TABLES
-- Removes previously-created payroll tables so STEP1 can recreate them cleanly
-- ============================================

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS bonuses CASCADE;
DROP TABLE IF EXISTS commissions CASCADE;
DROP TABLE IF EXISTS payroll_entries CASCADE;
DROP TABLE IF EXISTS payroll_periods CASCADE;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Payroll tables dropped (payments, bonuses, commissions, payroll_entries, payroll_periods)';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Now run: ADMIN_DASHBOARD_STEP1.sql';
END $$;
