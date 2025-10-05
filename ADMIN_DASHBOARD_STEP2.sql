-- ============================================
-- ADMIN DASHBOARD STEP 2: TRIGGERS & POLICIES
-- Run this AFTER ADMIN_DASHBOARD_STEP1.sql
-- ============================================

-- ============================================
-- 1. ENABLE RLS
-- ============================================

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. RLS POLICIES - PAYROLL_PERIODS
-- ============================================

DROP POLICY IF EXISTS "Admins can manage payroll periods" ON payroll_periods;

CREATE POLICY "Admins can manage payroll periods" ON payroll_periods
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- 3. RLS POLICIES - PAYROLL_ENTRIES
-- ============================================

DROP POLICY IF EXISTS "Admins can manage payroll entries" ON payroll_entries;
DROP POLICY IF EXISTS "Trainers can view own payroll entries" ON payroll_entries;

CREATE POLICY "Admins can manage payroll entries" ON payroll_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view own payroll entries" ON payroll_entries
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 4. RLS POLICIES - COMMISSIONS
-- ============================================

DROP POLICY IF EXISTS "Admins can manage commissions" ON commissions;
DROP POLICY IF EXISTS "Trainers can view own commissions" ON commissions;

CREATE POLICY "Admins can manage commissions" ON commissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view own commissions" ON commissions
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 5. RLS POLICIES - BONUSES
-- ============================================

DROP POLICY IF EXISTS "Admins can manage bonuses" ON bonuses;
DROP POLICY IF EXISTS "Trainers can view own bonuses" ON bonuses;

CREATE POLICY "Admins can manage bonuses" ON bonuses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view own bonuses" ON bonuses
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 6. RLS POLICIES - PAYMENTS
-- ============================================

DROP POLICY IF EXISTS "Admins can manage payments" ON payments;
DROP POLICY IF EXISTS "Trainers can view own payments" ON payments;

CREATE POLICY "Admins can manage payments" ON payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view own payments" ON payments
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 7. HELPER FUNCTIONS & TRIGGERS
-- ============================================

-- Function to calculate payroll entry totals
CREATE OR REPLACE FUNCTION calculate_payroll_entry_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate gross amount
  NEW.gross_amount = COALESCE(NEW.base_amount, 0) + 
                     COALESCE(NEW.commission_amount, 0) + 
                     COALESCE(NEW.bonus_amount, 0) + 
                     COALESCE(NEW.overtime_amount, 0);
  
  -- Calculate net amount
  NEW.net_amount = NEW.gross_amount - COALESCE(NEW.deductions, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_payroll_totals_trigger ON payroll_entries;
CREATE TRIGGER calculate_payroll_totals_trigger
  BEFORE INSERT OR UPDATE ON payroll_entries
  FOR EACH ROW
  EXECUTE FUNCTION calculate_payroll_entry_totals();

-- Function to update payroll period total
CREATE OR REPLACE FUNCTION update_payroll_period_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE payroll_periods
  SET total_amount = (
    SELECT COALESCE(SUM(net_amount), 0)
    FROM payroll_entries
    WHERE payroll_period_id = COALESCE(NEW.payroll_period_id, OLD.payroll_period_id)
  )
  WHERE id = COALESCE(NEW.payroll_period_id, OLD.payroll_period_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_period_total_trigger ON payroll_entries;
CREATE TRIGGER update_period_total_trigger
  AFTER INSERT OR UPDATE OR DELETE ON payroll_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_period_total();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ STEP 2 COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🔒 RLS policies configured';
  RAISE NOTICE '⚡ Triggers: Auto-calculate totals';
  RAISE NOTICE '✨ Admin Dashboard ready!';
END $$;
