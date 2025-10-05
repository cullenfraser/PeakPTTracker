-- ============================================
-- STEP 1: CREATE ALL TABLES AND COLUMNS
-- Run this first, then run STEP2
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop any existing triggers that might interfere (ignore errors if tables don't exist)
DO $$
BEGIN
  DROP TRIGGER IF EXISTS create_client_trigger ON contracts;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_completed_sessions_trigger ON training_sessions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop any existing functions
DROP FUNCTION IF EXISTS create_client_from_contract() CASCADE;
DROP FUNCTION IF EXISTS update_completed_sessions_count() CASCADE;

-- ============================================
-- 1. ADMIN_USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  role TEXT DEFAULT 'admin',
  permissions JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);

-- ============================================
-- 2. TRAINERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS trainers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  
  hourly_rate DECIMAL(10, 2),
  salary DECIMAL(10, 2),
  commission_rate DECIMAL(5, 2),
  payment_type TEXT,
  calendar_color TEXT DEFAULT '#3FAE52',
  
  hire_date DATE,
  notes TEXT
);

-- Verify trainers table has id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trainers' AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'ERROR: trainers table exists but does not have an id column. Please drop the trainers table and run this script again: DROP TABLE trainers CASCADE;';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trainers_user_id ON trainers(user_id);
CREATE INDEX IF NOT EXISTS idx_trainers_email ON trainers(email);

-- ============================================
-- 3. CLIENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Canada',
  
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  medical_conditions TEXT,
  injuries TEXT,
  medications TEXT,
  fitness_goals TEXT,
  
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);

-- ============================================
-- 4. QUOTES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
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
  
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  medical_conditions TEXT,
  injuries TEXT,
  medications TEXT,
  
  square_customer_id TEXT,
  square_invoice_id TEXT,
  
  start_date DATE NOT NULL,
  participants INTEGER NOT NULL,
  frequency TEXT NOT NULL,
  package_length INTEGER NOT NULL,
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
  
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON quotes(created_by);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_start_date ON quotes(start_date);

-- ============================================
-- 5. CONTRACTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  quote_id UUID REFERENCES quotes(id),
  contract_number TEXT UNIQUE NOT NULL,
  
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
  
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  medical_conditions TEXT,
  injuries TEXT,
  medications TEXT,
  
  square_customer_id TEXT,
  square_invoice_id TEXT,
  
  start_date DATE NOT NULL,
  end_date DATE,
  participants INTEGER NOT NULL,
  frequency TEXT NOT NULL,
  package_length INTEGER NOT NULL,
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
  
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id)
);

-- Add client and trainer columns (in case table already exists without them)
DO $$
BEGIN
  -- Add client_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE contracts ADD COLUMN client_id UUID REFERENCES clients(id);
  END IF;
  
  -- Add trainer_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'trainer_id'
  ) THEN
    ALTER TABLE contracts ADD COLUMN trainer_id UUID REFERENCES trainers(id);
  END IF;
  
  -- Add completed_sessions if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'completed_sessions'
  ) THEN
    ALTER TABLE contracts ADD COLUMN completed_sessions INTEGER DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON contracts(created_by);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_start_date ON contracts(start_date);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_trainer_id ON contracts(trainer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_quote_id ON contracts(quote_id);

-- ============================================
-- 6. TRAINING_SESSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  trainer_id UUID REFERENCES trainers(id) NOT NULL,
  contract_id UUID REFERENCES contracts(id),
  
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  session_type TEXT DEFAULT '1_on_1',
  class_type TEXT,
  team_name TEXT,
  participant_ids UUID[] DEFAULT '{}',
  attendance_data JSONB DEFAULT '{}',
  
  status TEXT DEFAULT 'scheduled',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_trainer ON training_sessions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_contract ON training_sessions(contract_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_date ON training_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status);

-- ============================================
-- 7. CLIENT_TRAINER_ASSIGNMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS client_trainer_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  
  assigned_date TIMESTAMPTZ DEFAULT NOW(),
  unassigned_date TIMESTAMPTZ,
  
  UNIQUE(client_id, trainer_id, contract_id)
);

CREATE INDEX IF NOT EXISTS idx_client_trainer_client ON client_trainer_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_trainer_trainer ON client_trainer_assignments(trainer_id);
CREATE INDEX IF NOT EXISTS idx_client_trainer_contract ON client_trainer_assignments(contract_id);

-- ============================================
-- 8. HOURS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  trainer_id UUID REFERENCES trainers(id) NOT NULL,
  date DATE NOT NULL,
  hours_worked DECIMAL(5, 2) NOT NULL,
  description TEXT,
  approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hours_trainer ON hours(trainer_id);
CREATE INDEX IF NOT EXISTS idx_hours_date ON hours(date);

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ STEP 1 COMPLETE: All tables created!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Next: Run STEP2_TRIGGERS_AND_POLICIES.sql';
END $$;
