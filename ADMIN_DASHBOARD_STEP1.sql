-- ============================================
-- ADMIN DASHBOARD STEP 1: CREATE TABLES
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
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ STEP 1 COMPLETE: Tables created!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📋 Tables: payroll_periods, payroll_entries, commissions, bonuses, payments';
  RAISE NOTICE 'Next: Run ADMIN_DASHBOARD_STEP2.sql';
END $$;
