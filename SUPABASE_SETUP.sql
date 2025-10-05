-- Peak Fitness Dieppe - Supabase Database Setup (Training Sessions Model)
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Quotes table (Training Sessions)
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Basic customer info
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  
  -- Full client details
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT,
  company_name TEXT,
  
  -- Emergency contact
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  -- Health information
  medical_conditions TEXT,
  injuries TEXT,
  medications TEXT,
  
  -- Square integration
  square_customer_id TEXT,
  square_invoice_id TEXT,
  
  -- Training package details
  start_date DATE NOT NULL,
  participants INTEGER NOT NULL CHECK (participants >= 1 AND participants <= 3),
  frequency TEXT NOT NULL,
  package_length INTEGER NOT NULL CHECK (package_length >= 1 AND package_length <= 3),
  total_sessions INTEGER NOT NULL,
  price_per_session DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) NOT NULL,
  processing_fee DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  payment_schedule TEXT NOT NULL,
  down_payment DECIMAL(10, 2) DEFAULT 0,
  split_payment BOOLEAN DEFAULT FALSE,
  
  -- Status and metadata
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id)
);

-- Contracts table (Training Sessions)
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  quote_id UUID REFERENCES quotes(id),
  contract_number TEXT UNIQUE NOT NULL,
  
  -- Client information (copied from quote)
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT,
  company_name TEXT,
  
  -- Emergency contact
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  -- Health information
  medical_conditions TEXT,
  injuries TEXT,
  medications TEXT,
  
  -- Square integration
  square_customer_id TEXT,
  square_invoice_id TEXT,
  
  -- Training package details
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  frequency TEXT NOT NULL,
  participants INTEGER NOT NULL,
  total_sessions INTEGER NOT NULL,
  payment_amount DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  payment_schedule TEXT NOT NULL,
  down_payment DECIMAL(10, 2) DEFAULT 0,
  split_payment BOOLEAN DEFAULT FALSE,
  
  -- Contract specific
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'cancelled', 'completed', 'pending')),
  signed_date DATE,
  signature_data TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id)
);

-- Hours table
CREATE TABLE hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  day_of_week TEXT NOT NULL,
  opening_time TIME NOT NULL,
  closing_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- Trainers table
CREATE TABLE trainers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  specialization TEXT,
  bio TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  calendar_color TEXT DEFAULT '#3FAE52',
  
  -- Payroll information
  pay_rate_per_session DECIMAL(10, 2) DEFAULT 0,
  pay_rate_type TEXT DEFAULT 'per_session' CHECK (pay_rate_type IN ('per_session', 'hourly', 'salary')),
  hourly_rate DECIMAL(10, 2) DEFAULT 0,
  monthly_salary DECIMAL(10, 2) DEFAULT 0,
  commission_rate DECIMAL(5, 2) DEFAULT 0,
  
  -- Banking (optional, for direct deposit)
  bank_account_last4 TEXT,
  payment_method TEXT DEFAULT 'manual' CHECK (payment_method IN ('manual', 'direct_deposit', 'check')),
  
  -- Employment details
  employment_type TEXT DEFAULT 'contractor' CHECK (employment_type IN ('contractor', 'part_time', 'full_time')),
  hire_date DATE,
  termination_date DATE,
  
  -- Performance tracking
  total_sessions_completed INTEGER DEFAULT 0,
  total_revenue_generated DECIMAL(10, 2) DEFAULT 0,
  average_client_rating DECIMAL(3, 2) DEFAULT 0
);

-- Training sessions table (for calendar and attendance tracking)
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Contract reference
  contract_id UUID REFERENCES contracts(id) NOT NULL,
  trainer_id UUID REFERENCES trainers(id) NOT NULL,
  
  -- Session details
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  session_number INTEGER NOT NULL,
  
  -- Status tracking
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'late_cancellation', 'no_show')),
  cancellation_reason TEXT,
  
  -- Attendance (for multiple participants)
  participants_attended JSONB DEFAULT '[]',
  attendance_notes TEXT,
  
  -- Metadata
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Client-Trainer assignments (many-to-many through contracts)
CREATE TABLE client_trainer_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  contract_id UUID REFERENCES contracts(id) NOT NULL,
  trainer_id UUID REFERENCES trainers(id) NOT NULL,
  is_primary BOOLEAN DEFAULT TRUE,
  assigned_date DATE DEFAULT CURRENT_DATE,
  UNIQUE(contract_id, trainer_id)
);

-- Payroll periods table (for tracking trainer payments)
CREATE TABLE payroll_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Period details
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT DEFAULT 'weekly' CHECK (period_type IN ('weekly', 'bi_weekly', 'monthly')),
  
  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'processing', 'paid', 'closed')),
  processed_date DATE,
  paid_date DATE,
  
  -- Totals
  total_sessions INTEGER DEFAULT 0,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  
  -- Metadata
  notes TEXT,
  processed_by UUID REFERENCES auth.users(id)
);

-- Trainer payroll records (individual trainer payments per period)
CREATE TABLE trainer_payroll (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- References
  payroll_period_id UUID REFERENCES payroll_periods(id) NOT NULL,
  trainer_id UUID REFERENCES trainers(id) NOT NULL,
  
  -- Session counts
  sessions_completed INTEGER DEFAULT 0,
  sessions_cancelled INTEGER DEFAULT 0,
  sessions_no_show INTEGER DEFAULT 0,
  total_hours DECIMAL(10, 2) DEFAULT 0,
  
  -- Calculations
  base_pay DECIMAL(10, 2) DEFAULT 0,
  commission_amount DECIMAL(10, 2) DEFAULT 0,
  bonus_amount DECIMAL(10, 2) DEFAULT 0,
  deductions DECIMAL(10, 2) DEFAULT 0,
  total_pay DECIMAL(10, 2) DEFAULT 0,
  
  -- Payment details
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'paid', 'on_hold')),
  payment_date DATE,
  payment_method TEXT,
  payment_reference TEXT,
  
  -- Metadata
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_date DATE,
  
  UNIQUE(payroll_period_id, trainer_id)
);

-- Admin users table (for role-based access)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'manager')),
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_quotes_created_by ON quotes(created_by);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_start_date ON quotes(start_date);
CREATE INDEX idx_contracts_created_by ON contracts(created_by);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_start_date ON contracts(start_date);
CREATE INDEX idx_hours_date ON hours(date);
CREATE INDEX idx_trainers_user_id ON trainers(user_id);
CREATE INDEX idx_trainers_is_active ON trainers(is_active);
CREATE INDEX idx_training_sessions_contract_id ON training_sessions(contract_id);
CREATE INDEX idx_training_sessions_trainer_id ON training_sessions(trainer_id);
CREATE INDEX idx_training_sessions_date ON training_sessions(session_date);
CREATE INDEX idx_training_sessions_status ON training_sessions(status);
CREATE INDEX idx_client_trainer_assignments_contract ON client_trainer_assignments(contract_id);
CREATE INDEX idx_client_trainer_assignments_trainer ON client_trainer_assignments(trainer_id);
CREATE INDEX idx_payroll_periods_dates ON payroll_periods(period_start, period_end);
CREATE INDEX idx_payroll_periods_status ON payroll_periods(status);
CREATE INDEX idx_trainer_payroll_period ON trainer_payroll(payroll_period_id);
CREATE INDEX idx_trainer_payroll_trainer ON trainer_payroll(trainer_id);
CREATE INDEX idx_trainer_payroll_status ON trainer_payroll(payment_status);
CREATE INDEX idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- ============================================
-- TRIGGERS
-- ============================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trainers_updated_at BEFORE UPDATE ON trainers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_sessions_updated_at BEFORE UPDATE ON training_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payroll_periods_updated_at BEFORE UPDATE ON payroll_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trainer_payroll_updated_at BEFORE UPDATE ON trainer_payroll
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- RPC function to compute quote total
CREATE OR REPLACE FUNCTION compute_quote_total(
  base_price DECIMAL,
  discount_percent DECIMAL,
  tax_percent DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  discount_amount DECIMAL;
  subtotal DECIMAL;
  tax_amount DECIMAL;
  total DECIMAL;
BEGIN
  discount_amount := base_price * (discount_percent / 100);
  subtotal := base_price - discount_amount;
  tax_amount := subtotal * (tax_percent / 100);
  total := subtotal + tax_amount;
  RETURN ROUND(total, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_trainer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Quotes policies
CREATE POLICY "Users can view their own quotes"
  ON quotes FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create quotes"
  ON quotes FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own quotes"
  ON quotes FOR UPDATE
  USING (auth.uid() = created_by);

-- Contracts policies
CREATE POLICY "Users can view their own contracts"
  ON contracts FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create contracts"
  ON contracts FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own contracts"
  ON contracts FOR UPDATE
  USING (auth.uid() = created_by);

-- Hours policies (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view hours"
  ON hours FOR SELECT
  TO authenticated
  USING (true);

-- Trainers policies
CREATE POLICY "Authenticated users can view active trainers"
  ON trainers FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Trainers can update their own profile"
  ON trainers FOR UPDATE
  USING (auth.uid() = user_id);

-- Training sessions policies
CREATE POLICY "Trainers can view their sessions"
  ON training_sessions FOR SELECT
  TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
    OR
    contract_id IN (SELECT id FROM contracts WHERE created_by = auth.uid())
  );

CREATE POLICY "Trainers can create sessions"
  ON training_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

CREATE POLICY "Trainers can update their sessions"
  ON training_sessions FOR UPDATE
  TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

CREATE POLICY "Trainers can delete their sessions"
  ON training_sessions FOR DELETE
  TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

-- Client-Trainer assignments policies
CREATE POLICY "Users can view assignments"
  ON client_trainer_assignments FOR SELECT
  TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
    OR
    contract_id IN (SELECT id FROM contracts WHERE created_by = auth.uid())
  );

CREATE POLICY "Users can create assignments"
  ON client_trainer_assignments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update assignments"
  ON client_trainer_assignments FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Payroll periods policies (admin only)
CREATE POLICY "Admins can view payroll periods"
  ON payroll_periods FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
  );

CREATE POLICY "Admins can create payroll periods"
  ON payroll_periods FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
  );

CREATE POLICY "Admins can update payroll periods"
  ON payroll_periods FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
  );

-- Trainer payroll policies
CREATE POLICY "Admins and trainers can view payroll"
  ON trainer_payroll FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
    OR
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can create trainer payroll"
  ON trainer_payroll FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
  );

CREATE POLICY "Admins can update trainer payroll"
  ON trainer_payroll FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
  );

-- Admin users policies
CREATE POLICY "Admins can view admin users"
  ON admin_users FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
  );

CREATE POLICY "Super admins can manage admin users"
  ON admin_users FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin' AND is_active = true)
  );

-- ============================================
-- SAMPLE DATA (Optional)
-- ============================================

-- Insert sample hours for the current week
INSERT INTO hours (date, day_of_week, opening_time, closing_time, is_closed, notes) VALUES
  ('2025-10-06', 'Monday', '06:00', '22:00', false, 'Regular hours'),
  ('2025-10-07', 'Tuesday', '06:00', '22:00', false, 'Regular hours'),
  ('2025-10-08', 'Wednesday', '06:00', '22:00', false, 'Regular hours'),
  ('2025-10-09', 'Thursday', '06:00', '22:00', false, 'Regular hours'),
  ('2025-10-10', 'Friday', '06:00', '20:00', false, 'Early close'),
  ('2025-10-11', 'Saturday', '08:00', '18:00', false, 'Weekend hours'),
  ('2025-10-12', 'Sunday', '10:00', '16:00', false, 'Weekend hours');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('quotes', 'contracts', 'hours', 'trainers', 'training_sessions', 'client_trainer_assignments', 'payroll_periods', 'trainer_payroll', 'admin_users');

-- Verify RPC function
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'compute_quote_total';

-- Test RPC function
SELECT compute_quote_total(100.00, 10.00, 15.00) AS calculated_total;
-- Expected result: 103.50 (100 - 10% discount = 90, + 15% tax = 103.50)

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('quotes', 'contracts', 'hours');

-- View all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';
