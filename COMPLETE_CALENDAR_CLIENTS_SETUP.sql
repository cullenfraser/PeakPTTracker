-- ============================================
-- COMPLETE CALENDAR & CLIENTS SETUP SQL SCRIPT
-- Run this in Supabase SQL Editor
-- Creates all tables and columns needed
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
  role TEXT DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'manager')),
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
  
  -- Compensation
  hourly_rate DECIMAL(10, 2),
  salary DECIMAL(10, 2),
  commission_rate DECIMAL(5, 2),
  payment_type TEXT CHECK (payment_type IN ('hourly', 'salary', 'per_session', 'hybrid')),
  
  -- Calendar
  calendar_color TEXT DEFAULT '#3FAE52',
  
  -- Metadata
  hire_date DATE,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_trainers_user_id ON trainers(user_id);
CREATE INDEX IF NOT EXISTS idx_trainers_email ON trainers(email);

-- ============================================
-- 3. CLIENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Basic Information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Canada',
  
  -- Emergency Contact
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  -- Health Information
  medical_conditions TEXT,
  injuries TEXT,
  medications TEXT,
  fitness_goals TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);

-- ============================================
-- 4. CONTRACTS TABLE
-- ============================================

-- Add missing columns to contracts table
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id),
ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id),
ADD COLUMN IF NOT EXISTS completed_sessions INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_trainer_id ON contracts(trainer_id);

-- ============================================
-- 5. TRAINING_SESSIONS TABLE
-- ============================================

-- Create table if it doesn't exist
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

-- Update status constraint if needed
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'training_sessions' AND constraint_name LIKE '%status%'
  ) THEN
    ALTER TABLE training_sessions 
    ADD CONSTRAINT training_sessions_status_check 
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_training_sessions_trainer ON training_sessions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_contract ON training_sessions(contract_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_date ON training_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status);

COMMENT ON COLUMN training_sessions.session_type IS '1_on_1, small_group, peak_class, pfa_class, pfa_team, meeting, onboarding, general';
COMMENT ON COLUMN training_sessions.class_type IS 'For peak_class: bootcamp, barbell_strength, boga, peakrox, muscle_building, glutes_abs, strength_sweat';
COMMENT ON COLUMN training_sessions.team_name IS 'For pfa_team: team name';
COMMENT ON COLUMN training_sessions.attendance_data IS 'JSON: {participant_id: "present|absent|late"}';

-- ============================================
-- 6. CLIENT_TRAINER_ASSIGNMENTS TABLE
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
-- 7. ASSIGN COLORS TO EXISTING TRAINERS
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
-- 8. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_trainer_assignments ENABLE ROW LEVEL SECURITY;

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
-- CONTRACTS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can view all contracts" ON contracts;
DROP POLICY IF EXISTS "Trainers can view assigned contracts" ON contracts;
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
-- 9. HELPER FUNCTIONS & TRIGGERS
-- ============================================

-- Function to auto-create client from contract
CREATE OR REPLACE FUNCTION create_client_from_contract()
RETURNS TRIGGER AS $$
DECLARE
  new_client_id UUID;
  existing_client_id UUID;
BEGIN
  -- Only process when contract becomes active and no client_id exists
  IF NEW.status = 'active' AND NEW.client_id IS NULL THEN
    
    -- Check if client already exists by email or phone
    SELECT id INTO existing_client_id
    FROM clients
    WHERE (email = NEW.customer_email AND email IS NOT NULL)
       OR (phone = NEW.customer_phone AND phone IS NOT NULL)
    LIMIT 1;
    
    IF existing_client_id IS NOT NULL THEN
      -- Use existing client
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
        COALESCE(NEW.first_name, split_part(NEW.customer_name, ' ', 1)),
        COALESCE(NEW.last_name, split_part(NEW.customer_name, ' ', 2)),
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS create_client_trigger ON contracts;
CREATE TRIGGER create_client_trigger
  BEFORE INSERT OR UPDATE OF status ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION create_client_from_contract();

-- Function to update completed sessions count
CREATE OR REPLACE FUNCTION update_completed_sessions_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE contracts
    SET completed_sessions = completed_sessions + 1
    WHERE id = NEW.contract_id;
  ELSIF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    UPDATE contracts
    SET completed_sessions = GREATEST(completed_sessions - 1, 0)
    WHERE id = NEW.contract_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_completed_sessions_trigger ON training_sessions;
CREATE TRIGGER update_completed_sessions_trigger
  AFTER INSERT OR UPDATE OF status ON training_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_completed_sessions_count();

-- ============================================
-- 10. VERIFICATION QUERIES
-- ============================================

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('admin_users', 'trainers', 'clients', 'contracts', 'training_sessions', 'client_trainer_assignments')
ORDER BY table_name;

-- Check training_sessions columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'training_sessions'
ORDER BY ordinal_position;

-- Check clients columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;

-- Check contracts has new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contracts'
AND column_name IN ('client_id', 'trainer_id', 'completed_sessions')
ORDER BY column_name;

-- Check trainers has calendar_color
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'trainers'
AND column_name = 'calendar_color';

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Complete Calendar & Clients setup finished!';
  RAISE NOTICE '📋 Tables: admin_users, trainers, clients, contracts, training_sessions, client_trainer_assignments';
  RAISE NOTICE '📅 Session types: 1_on_1, small_group, peak_class, pfa_class, pfa_team, meeting, onboarding, general';
  RAISE NOTICE '🎨 Trainer calendar colors assigned';
  RAISE NOTICE '🔒 RLS policies configured';
  RAISE NOTICE '⚡ Auto-triggers: client creation, session counting';
  RAISE NOTICE '✨ Ready to use!';
END $$;
