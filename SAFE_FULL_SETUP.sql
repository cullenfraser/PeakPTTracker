-- ============================================
-- SAFE COMPLETE DATABASE SETUP
-- Peak Fitness Dieppe
-- Creates everything if it doesn't exist
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Add constraint if it doesn't exist
DO $$ 
BEGIN
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
  ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check 
    CHECK (role IN ('super_admin', 'admin', 'manager'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

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
  
  hire_date DATE,
  notes TEXT
);

-- Add columns if they don't exist
ALTER TABLE trainers
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS salary DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS payment_type TEXT,
ADD COLUMN IF NOT EXISTS calendar_color TEXT DEFAULT '#3FAE52';

-- Add constraint if it doesn't exist
DO $$ 
BEGIN
  ALTER TABLE trainers DROP CONSTRAINT IF EXISTS trainers_payment_type_check;
  ALTER TABLE trainers ADD CONSTRAINT trainers_payment_type_check 
    CHECK (payment_type IN ('hourly', 'salary', 'per_session', 'hybrid'));
EXCEPTION WHEN OTHERS THEN NULL;
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

-- Add constraints
DO $$ 
BEGIN
  ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_participants_check;
  ALTER TABLE quotes ADD CONSTRAINT quotes_participants_check 
    CHECK (participants >= 1 AND participants <= 3);
  
  ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_package_length_check;
  ALTER TABLE quotes ADD CONSTRAINT quotes_package_length_check 
    CHECK (package_length >= 1 AND package_length <= 3);
    
  ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
  ALTER TABLE quotes ADD CONSTRAINT quotes_status_check 
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

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

-- Add new columns if they don't exist
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS client_id UUID,
ADD COLUMN IF NOT EXISTS trainer_id UUID,
ADD COLUMN IF NOT EXISTS completed_sessions INTEGER DEFAULT 0;

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'contracts_client_id_fkey'
  ) THEN
    ALTER TABLE contracts 
    ADD CONSTRAINT contracts_client_id_fkey 
    FOREIGN KEY (client_id) REFERENCES clients(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'contracts_trainer_id_fkey'
  ) THEN
    ALTER TABLE contracts 
    ADD CONSTRAINT contracts_trainer_id_fkey 
    FOREIGN KEY (trainer_id) REFERENCES trainers(id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add constraints
DO $$ 
BEGIN
  ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
  ALTER TABLE contracts ADD CONSTRAINT contracts_status_check 
    CHECK (status IN ('active', 'completed', 'cancelled', 'on_hold'));
EXCEPTION WHEN OTHERS THEN NULL;
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
  
  status TEXT DEFAULT 'scheduled',
  notes TEXT
);

-- Add new columns if they don't exist
ALTER TABLE training_sessions
ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT '1_on_1',
ADD COLUMN IF NOT EXISTS class_type TEXT,
ADD COLUMN IF NOT EXISTS team_name TEXT,
ADD COLUMN IF NOT EXISTS participant_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS attendance_data JSONB DEFAULT '{}';

-- Add constraint
DO $$ 
BEGIN
  ALTER TABLE training_sessions DROP CONSTRAINT IF EXISTS training_sessions_status_check;
  ALTER TABLE training_sessions ADD CONSTRAINT training_sessions_status_check 
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_training_sessions_trainer ON training_sessions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_contract ON training_sessions(contract_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_date ON training_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status);

COMMENT ON COLUMN training_sessions.session_type IS '1_on_1, small_group, peak_class, pfa_class, pfa_team, meeting, onboarding, general';
COMMENT ON COLUMN training_sessions.class_type IS 'For peak_class: bootcamp, barbell_strength, boga, peakrox, muscle_building, glutes_abs, strength_sweat';
COMMENT ON COLUMN training_sessions.team_name IS 'For pfa_team: team name';

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
-- 9. ASSIGN TRAINER COLORS
-- ============================================

UPDATE trainers 
SET calendar_color = (
  CASE (random() * 10)::int
    WHEN 0 THEN '#3FAE52'
    WHEN 1 THEN '#2563EB'
    WHEN 2 THEN '#DC2626'
    WHEN 3 THEN '#9333EA'
    WHEN 4 THEN '#EA580C'
    WHEN 5 THEN '#0891B2'
    WHEN 6 THEN '#65A30D'
    WHEN 7 THEN '#DB2777'
    WHEN 8 THEN '#7C3AED'
    ELSE '#F59E0B'
  END
)
WHERE calendar_color = '#3FAE52' OR calendar_color IS NULL;

-- ============================================
-- 10. HELPER FUNCTIONS
-- ============================================

-- Only create function and trigger if columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'client_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'trainer_id'
  ) THEN
    
    -- Function to auto-create client from contract
    EXECUTE '
    CREATE OR REPLACE FUNCTION create_client_from_contract()
    RETURNS TRIGGER AS $func$
    DECLARE
      new_client_id UUID;
      existing_client_id UUID;
    BEGIN
      -- Only process when contract becomes active and no client_id exists
      IF NEW.status = ''active'' AND NEW.client_id IS NULL THEN
        
        -- Check if client already exists
        SELECT id INTO existing_client_id
        FROM clients
        WHERE (email = NEW.customer_email AND email IS NOT NULL)
           OR (phone = NEW.customer_phone AND phone IS NOT NULL)
        LIMIT 1;
        
        IF existing_client_id IS NOT NULL THEN
          NEW.client_id = existing_client_id;
        ELSE
          -- Create new client
          INSERT INTO clients (
            first_name,
            last_name,
            email,
            phone,
            date_of_birth,
            address_line1,
            address_line2,
            city,
            province,
            postal_code,
            country,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship,
            medical_conditions,
            injuries,
            medications,
            is_active,
            created_by
          ) VALUES (
            COALESCE(NEW.first_name, split_part(NEW.customer_name, '' '', 1)),
            COALESCE(NEW.last_name, split_part(NEW.customer_name, '' '', 2)),
            NEW.customer_email,
            NEW.customer_phone,
            NEW.date_of_birth,
            NEW.address_line1,
            NEW.address_line2,
            NEW.city,
            NEW.province,
            NEW.postal_code,
            NEW.country,
            NEW.emergency_contact_name,
            NEW.emergency_contact_phone,
            NEW.emergency_contact_relationship,
            NEW.medical_conditions,
            NEW.injuries,
            NEW.medications,
            true,
            NEW.created_by
          )
          RETURNING id INTO new_client_id;
          
          NEW.client_id = new_client_id;
        END IF;
        
        -- Create client-trainer assignment
        IF NEW.trainer_id IS NOT NULL AND NEW.client_id IS NOT NULL THEN
          INSERT INTO client_trainer_assignments (client_id, trainer_id, contract_id)
          VALUES (NEW.client_id, NEW.trainer_id, NEW.id)
          ON CONFLICT (client_id, trainer_id, contract_id) DO NOTHING;
        END IF;
      END IF;
      
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql SECURITY DEFINER;
    ';
    
    -- Create trigger
    DROP TRIGGER IF EXISTS create_client_trigger ON contracts;
    CREATE TRIGGER create_client_trigger
      BEFORE INSERT OR UPDATE OF status ON contracts
      FOR EACH ROW
      EXECUTE FUNCTION create_client_from_contract();
      
    RAISE NOTICE '✅ Client creation trigger installed';
  ELSE
    RAISE NOTICE '⚠️ Skipping client trigger - columns do not exist yet. Run this script again after adding columns.';
  END IF;
END $$;

-- Function to update completed sessions count
CREATE OR REPLACE FUNCTION update_completed_sessions_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE contracts
    SET completed_sessions = COALESCE(completed_sessions, 0) + 1
    WHERE id = NEW.contract_id;
  ELSIF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    UPDATE contracts
    SET completed_sessions = GREATEST(COALESCE(completed_sessions, 0) - 1, 0)
    WHERE id = NEW.contract_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN undefined_column THEN
  RETURN NEW; -- Column doesn't exist yet
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_completed_sessions_trigger ON training_sessions;
CREATE TRIGGER update_completed_sessions_trigger
  AFTER INSERT OR UPDATE OF status ON training_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_completed_sessions_count();

-- ============================================
-- 11. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_trainer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hours ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ADMIN_USERS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Super admins can manage admin users" ON admin_users;

CREATE POLICY "Admins can view admin users" ON admin_users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can manage admin users" ON admin_users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
      AND au.role = 'super_admin'
    )
  );

-- ============================================
-- TRAINERS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Everyone can view trainers" ON trainers;
DROP POLICY IF EXISTS "Admins can manage trainers" ON trainers;

CREATE POLICY "Everyone can view trainers" ON trainers
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage trainers" ON trainers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- CLIENTS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can view all clients" ON clients;
DROP POLICY IF EXISTS "Trainers can view assigned clients" ON clients;
DROP POLICY IF EXISTS "Admins can manage clients" ON clients;

CREATE POLICY "Admins can view all clients" ON clients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view assigned clients" ON clients
  FOR SELECT
  USING (
    id IN (
      SELECT client_id FROM client_trainer_assignments
      WHERE trainer_id IN (
        SELECT id FROM trainers WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage clients" ON clients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- QUOTES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view own quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can view all quotes" ON quotes;
DROP POLICY IF EXISTS "Users can create quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can manage quotes" ON quotes;

CREATE POLICY "Users can view own quotes" ON quotes
  FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Admins can view all quotes" ON quotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create quotes" ON quotes
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can manage quotes" ON quotes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- CONTRACTS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can view all contracts" ON contracts;
DROP POLICY IF EXISTS "Trainers can view assigned contracts" ON contracts;
DROP POLICY IF EXISTS "Users can view own contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can manage contracts" ON contracts;

CREATE POLICY "Admins can view all contracts" ON contracts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view assigned contracts" ON contracts
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own contracts" ON contracts
  FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Admins can manage contracts" ON contracts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- TRAINING_SESSIONS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can view all sessions" ON training_sessions;
DROP POLICY IF EXISTS "Trainers can view own sessions" ON training_sessions;
DROP POLICY IF EXISTS "Admins can insert sessions" ON training_sessions;
DROP POLICY IF EXISTS "Trainers can insert own sessions" ON training_sessions;
DROP POLICY IF EXISTS "Admins can update all sessions" ON training_sessions;
DROP POLICY IF EXISTS "Trainers can update own sessions" ON training_sessions;
DROP POLICY IF EXISTS "Admins can delete sessions" ON training_sessions;

CREATE POLICY "Admins can view all sessions" ON training_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view own sessions" ON training_sessions
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert sessions" ON training_sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can insert own sessions" ON training_sessions
  FOR INSERT
  WITH CHECK (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update all sessions" ON training_sessions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can update own sessions" ON training_sessions
  FOR UPDATE
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete sessions" ON training_sessions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- CLIENT_TRAINER_ASSIGNMENTS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can view all assignments" ON client_trainer_assignments;
DROP POLICY IF EXISTS "Trainers can view own assignments" ON client_trainer_assignments;
DROP POLICY IF EXISTS "Admins can manage assignments" ON client_trainer_assignments;

CREATE POLICY "Admins can view all assignments" ON client_trainer_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view own assignments" ON client_trainer_assignments
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage assignments" ON client_trainer_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- HOURS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can view all hours" ON hours;
DROP POLICY IF EXISTS "Trainers can view own hours" ON hours;
DROP POLICY IF EXISTS "Trainers can insert own hours" ON hours;
DROP POLICY IF EXISTS "Admins can manage hours" ON hours;

CREATE POLICY "Admins can view all hours" ON hours
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can view own hours" ON hours
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers can insert own hours" ON hours
  FOR INSERT
  WITH CHECK (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage hours" ON hours
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- 12. DIAGNOSTIC CHECKS
-- ============================================

-- Check contracts table columns
DO $$
DECLARE
  has_client_id BOOLEAN;
  has_trainer_id BOOLEAN;
  has_completed_sessions BOOLEAN;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '🔍 DIAGNOSTIC: Checking contracts table columns';
  RAISE NOTICE '========================================';
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'client_id'
  ) INTO has_client_id;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'trainer_id'
  ) INTO has_trainer_id;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts' AND column_name = 'completed_sessions'
  ) INTO has_completed_sessions;
  
  IF has_client_id THEN
    RAISE NOTICE '✅ contracts.client_id EXISTS';
  ELSE
    RAISE NOTICE '❌ contracts.client_id DOES NOT EXIST';
  END IF;
  
  IF has_trainer_id THEN
    RAISE NOTICE '✅ contracts.trainer_id EXISTS';
  ELSE
    RAISE NOTICE '❌ contracts.trainer_id DOES NOT EXIST';
  END IF;
  
  IF has_completed_sessions THEN
    RAISE NOTICE '✅ contracts.completed_sessions EXISTS';
  ELSE
    RAISE NOTICE '❌ contracts.completed_sessions DOES NOT EXIST';
  END IF;
END $$;

-- Check training_sessions table columns
DO $$
DECLARE
  has_session_type BOOLEAN;
  has_class_type BOOLEAN;
  has_team_name BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔍 DIAGNOSTIC: Checking training_sessions table columns';
  RAISE NOTICE '========================================';
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'training_sessions' AND column_name = 'session_type'
  ) INTO has_session_type;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'training_sessions' AND column_name = 'class_type'
  ) INTO has_class_type;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'training_sessions' AND column_name = 'team_name'
  ) INTO has_team_name;
  
  IF has_session_type THEN
    RAISE NOTICE '✅ training_sessions.session_type EXISTS';
  ELSE
    RAISE NOTICE '❌ training_sessions.session_type DOES NOT EXIST';
  END IF;
  
  IF has_class_type THEN
    RAISE NOTICE '✅ training_sessions.class_type EXISTS';
  ELSE
    RAISE NOTICE '❌ training_sessions.class_type DOES NOT EXIST';
  END IF;
  
  IF has_team_name THEN
    RAISE NOTICE '✅ training_sessions.team_name EXISTS';
  ELSE
    RAISE NOTICE '❌ training_sessions.team_name DOES NOT EXIST';
  END IF;
END $$;

-- Check client_trainer_assignments table
DO $$
DECLARE
  table_exists BOOLEAN;
  has_client_id BOOLEAN;
  has_trainer_id BOOLEAN;
  has_contract_id BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔍 DIAGNOSTIC: Checking client_trainer_assignments table';
  RAISE NOTICE '========================================';
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'client_trainer_assignments'
  ) INTO table_exists;
  
  IF table_exists THEN
    RAISE NOTICE '✅ client_trainer_assignments table EXISTS';
    
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'client_trainer_assignments' AND column_name = 'client_id'
    ) INTO has_client_id;
    
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'client_trainer_assignments' AND column_name = 'trainer_id'
    ) INTO has_trainer_id;
    
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'client_trainer_assignments' AND column_name = 'contract_id'
    ) INTO has_contract_id;
    
    IF has_client_id THEN
      RAISE NOTICE '✅ client_trainer_assignments.client_id EXISTS';
    ELSE
      RAISE NOTICE '❌ client_trainer_assignments.client_id DOES NOT EXIST';
    END IF;
    
    IF has_trainer_id THEN
      RAISE NOTICE '✅ client_trainer_assignments.trainer_id EXISTS';
    ELSE
      RAISE NOTICE '❌ client_trainer_assignments.trainer_id DOES NOT EXIST';
    END IF;
    
    IF has_contract_id THEN
      RAISE NOTICE '✅ client_trainer_assignments.contract_id EXISTS';
    ELSE
      RAISE NOTICE '❌ client_trainer_assignments.contract_id DOES NOT EXIST';
    END IF;
  ELSE
    RAISE NOTICE '❌ client_trainer_assignments table DOES NOT EXIST';
  END IF;
END $$;

-- ============================================
-- 13. VERIFICATION
-- ============================================

SELECT 'Setup Complete!' as status;

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'admin_users', 
  'trainers', 
  'clients', 
  'quotes', 
  'contracts', 
  'training_sessions', 
  'client_trainer_assignments',
  'hours'
)
ORDER BY table_name;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ DATABASE SETUP COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Tables: admin_users, trainers, clients, quotes, contracts, training_sessions, client_trainer_assignments, hours';
  RAISE NOTICE '🔒 RLS Policies: Configured';
  RAISE NOTICE '⚡ Triggers: Auto-create clients, update session counts';
  RAISE NOTICE '🎨 Trainer Colors: Assigned';
  RAISE NOTICE '';
  RAISE NOTICE '✨ Ready to use!';
END $$;
