-- ============================================
-- ADMIN DASHBOARD TABLES SETUP
-- Payroll, payments, commissions, bonuses
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PAYROLL_PERIODS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payroll_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'bi_weekly', 'monthly')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'paid')),
  
  total_amount DECIMAL(10, 2) DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  notes TEXT,
  
  UNIQUE(period_type, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON payroll_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON payroll_periods(status);

-- ============================================
-- 2. PAYROLL_ENTRIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payroll_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  payroll_period_id UUID REFERENCES payroll_periods(id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE,
  
  -- Base pay
  base_amount DECIMAL(10, 2) DEFAULT 0,
  hours_worked DECIMAL(5, 2) DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,
  
  -- Additional earnings
  commission_amount DECIMAL(10, 2) DEFAULT 0,
  bonus_amount DECIMAL(10, 2) DEFAULT 0,
  overtime_amount DECIMAL(10, 2) DEFAULT 0,
  
  -- Deductions
  deductions DECIMAL(10, 2) DEFAULT 0,
  
  -- Totals
  gross_amount DECIMAL(10, 2) DEFAULT 0,
  net_amount DECIMAL(10, 2) DEFAULT 0,
  
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'paid')),
  paid_at TIMESTAMPTZ,
  
  notes TEXT,
  
  UNIQUE(payroll_period_id, trainer_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_trainer ON payroll_entries(trainer_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_status ON payroll_entries(status);

-- ============================================
-- 3. COMMISSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id),
  
  commission_type TEXT NOT NULL CHECK (commission_type IN ('new_client', 'renewal', 'package_upgrade', 'referral')),
  amount DECIMAL(10, 2) NOT NULL,
  rate DECIMAL(5, 2),
  base_amount DECIMAL(10, 2),
  
  payroll_entry_id UUID REFERENCES payroll_entries(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_commissions_trainer ON commissions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_payroll ON commissions(payroll_entry_id);

-- ============================================
-- 4. BONUSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS bonuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE,
  
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('performance', 'retention', 'holiday', 'referral', 'other')),
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  
  payroll_entry_id UUID REFERENCES payroll_entries(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_bonuses_trainer ON bonuses(trainer_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_status ON bonuses(status);
CREATE INDEX IF NOT EXISTS idx_bonuses_payroll ON bonuses(payroll_entry_id);

-- ============================================
-- 5. PAYMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  payroll_entry_id UUID REFERENCES payroll_entries(id),
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE,
  
  amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('direct_deposit', 'check', 'cash', 'e_transfer', 'other')),
  payment_date DATE NOT NULL,
  
  reference_number TEXT,
  confirmation_number TEXT,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_trainer ON payments(trainer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payroll_entry ON payments(payroll_entry_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ============================================
-- 6. ENABLE RLS
-- ============================================

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. RLS POLICIES - PAYROLL_PERIODS
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
-- 8. RLS POLICIES - PAYROLL_ENTRIES
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
-- 9. RLS POLICIES - COMMISSIONS
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
-- 10. RLS POLICIES - BONUSES
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
-- 11. RLS POLICIES - PAYMENTS
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
-- 12. HELPER FUNCTIONS
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
  RAISE NOTICE '✅ ADMIN DASHBOARD SETUP COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📋 Tables: payroll_periods, payroll_entries, commissions, bonuses, payments';
  RAISE NOTICE '🔒 RLS policies configured';
  RAISE NOTICE '⚡ Triggers: Auto-calculate totals';
  RAISE NOTICE '✨ Ready for payroll management!';
END $$;
