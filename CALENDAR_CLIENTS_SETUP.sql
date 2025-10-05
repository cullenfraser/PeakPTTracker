-- ============================================
-- CALENDAR & CLIENTS ENHANCEMENT SQL SCRIPT
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================
-- 1. UPDATE TRAINING_SESSIONS TABLE
-- ============================================

-- Add new columns for enhanced session types
ALTER TABLE training_sessions
ADD COLUMN IF NOT EXISTS class_type TEXT,
ADD COLUMN IF NOT EXISTS team_name TEXT,
ADD COLUMN IF NOT EXISTS attendance_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT '1_on_1';

-- Update session_type to use new values
COMMENT ON COLUMN training_sessions.session_type IS 'Session type: 1_on_1, small_group, peak_class, pfa_class, pfa_team, meeting, onboarding, general';
COMMENT ON COLUMN training_sessions.class_type IS 'For peak_class: bootcamp, barbell_strength, boga, peakrox, muscle_building, glutes_abs, strength_sweat';
COMMENT ON COLUMN training_sessions.team_name IS 'For pfa_team: team name';
COMMENT ON COLUMN training_sessions.attendance_data IS 'JSON object storing participant attendance: {participant_id: "present|absent|late"}';

-- ============================================
-- 2. CREATE CLIENTS TABLE (Created from Contracts)
-- ============================================

-- Clients are created when a contract is completed
-- This table stores the master client record
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Basic Information (from first contract)
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
  
  -- Status (active if they have any active contracts)
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);

-- ============================================
-- 3. UPDATE CONTRACTS TABLE FOR CLIENTS PAGE
-- ============================================

-- Link contracts to clients table and add trainer assignment
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id),
ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id),
ADD COLUMN IF NOT EXISTS completed_sessions INTEGER DEFAULT 0;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_trainer_id ON contracts(trainer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_customer_name ON contracts(customer_name);

COMMENT ON COLUMN contracts.client_id IS 'Links to clients table - created when contract is accepted/completed';

-- ============================================
-- 3. CREATE CLIENT_TRAINER_ASSIGNMENTS TABLE
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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_client_trainer_contract ON client_trainer_assignments(contract_id);
CREATE INDEX IF NOT EXISTS idx_client_trainer_trainer ON client_trainer_assignments(trainer_id);
CREATE INDEX IF NOT EXISTS idx_client_trainer_client ON client_trainer_assignments(client_id);

-- ============================================
-- 4. UPDATE TRAINERS TABLE
-- ============================================

-- Add calendar color for multi-trainer view
ALTER TABLE trainers
ADD COLUMN IF NOT EXISTS calendar_color TEXT DEFAULT '#3FAE52';

-- Set random colors for existing trainers
UPDATE trainers 
SET calendar_color = (
  CASE (id::text::uuid)::text::bit(8)::int % 10
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
WHERE calendar_color = '#3FAE52';

-- ============================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_trainer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TRAINING_SESSIONS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all sessions" ON training_sessions;
DROP POLICY IF EXISTS "Trainers can view own sessions" ON training_sessions;
DROP POLICY IF EXISTS "Admins can insert sessions" ON training_sessions;
DROP POLICY IF EXISTS "Trainers can insert own sessions" ON training_sessions;
DROP POLICY IF EXISTS "Admins can update all sessions" ON training_sessions;
DROP POLICY IF EXISTS "Trainers can update own sessions" ON training_sessions;
DROP POLICY IF EXISTS "Admins can delete sessions" ON training_sessions;

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions" ON training_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Trainers can view their own sessions
CREATE POLICY "Trainers can view own sessions" ON training_sessions
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

-- Admins can insert any session
CREATE POLICY "Admins can insert sessions" ON training_sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Trainers can insert their own sessions
CREATE POLICY "Trainers can insert own sessions" ON training_sessions
  FOR INSERT
  WITH CHECK (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

-- Admins can update all sessions
CREATE POLICY "Admins can update all sessions" ON training_sessions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Trainers can update their own sessions
CREATE POLICY "Trainers can update own sessions" ON training_sessions
  FOR UPDATE
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

-- Admins can delete sessions
CREATE POLICY "Admins can delete sessions" ON training_sessions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- CONTRACTS POLICIES (for Clients Page)
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all contracts" ON contracts;
DROP POLICY IF EXISTS "Trainers can view assigned contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can manage contracts" ON contracts;

-- Admins can view all contracts
CREATE POLICY "Admins can view all contracts" ON contracts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Trainers can view their assigned contracts
CREATE POLICY "Trainers can view assigned contracts" ON contracts
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

-- Admins can manage all contracts
CREATE POLICY "Admins can manage contracts" ON contracts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- CLIENT_TRAINER_ASSIGNMENTS POLICIES
-- ============================================

-- Admins can view all assignments
CREATE POLICY "Admins can view all assignments" ON client_trainer_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Trainers can view their own assignments
CREATE POLICY "Trainers can view own assignments" ON client_trainer_assignments
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainers
      WHERE trainers.user_id = auth.uid()
    )
  );

-- Admins can manage assignments
CREATE POLICY "Admins can manage assignments" ON client_trainer_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- TRAINERS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Everyone can view active trainers" ON trainers;
DROP POLICY IF EXISTS "Admins can manage trainers" ON trainers;

-- Everyone (authenticated) can view active trainers
CREATE POLICY "Everyone can view active trainers" ON trainers
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can manage trainers
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

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all clients" ON clients;
DROP POLICY IF EXISTS "Trainers can view assigned clients" ON clients;
DROP POLICY IF EXISTS "Admins can manage clients" ON clients;

-- Admins can view all clients
CREATE POLICY "Admins can view all clients" ON clients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Trainers can view their assigned clients
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

-- Admins can manage all clients
CREATE POLICY "Admins can manage clients" ON clients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. HELPER FUNCTIONS & TRIGGERS
-- ============================================

-- Function to auto-create client from contract when status changes to active
CREATE OR REPLACE FUNCTION create_client_from_contract()
RETURNS TRIGGER AS $$
DECLARE
  new_client_id UUID;
BEGIN
  -- Only create client if contract is being activated and no client_id exists
  IF NEW.status = 'active' AND NEW.client_id IS NULL THEN
    -- Insert new client with contract data
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
      created_by
    ) VALUES (
      NEW.first_name,
      NEW.last_name,
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
      NEW.created_by
    )
    RETURNING id INTO new_client_id;
    
    -- Update contract with client_id
    NEW.client_id = new_client_id;
    
    -- Create client-trainer assignment
    IF NEW.trainer_id IS NOT NULL THEN
      INSERT INTO client_trainer_assignments (client_id, trainer_id, contract_id)
      VALUES (new_client_id, NEW.trainer_id, NEW.id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-creating clients
DROP TRIGGER IF EXISTS create_client_trigger ON contracts;
CREATE TRIGGER create_client_trigger
  BEFORE INSERT OR UPDATE OF status ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION create_client_from_contract();

-- Function to calculate completed sessions for a contract
CREATE OR REPLACE FUNCTION calculate_completed_sessions(contract_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM training_sessions
    WHERE contract_id = contract_uuid
    AND status = 'completed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Create trigger for auto-updating completed sessions
DROP TRIGGER IF EXISTS update_completed_sessions_trigger ON training_sessions;
CREATE TRIGGER update_completed_sessions_trigger
  AFTER INSERT OR UPDATE OF status ON training_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_completed_sessions_count();

-- ============================================
-- 7. SAMPLE DATA (Optional - for testing)
-- ============================================

-- Uncomment below to add sample calendar colors to existing trainers
/*
UPDATE trainers SET calendar_color = '#3FAE52' WHERE calendar_color IS NULL;
*/

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check training_sessions columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'training_sessions'
ORDER BY ordinal_position;

-- Check contracts columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'contracts'
ORDER BY ordinal_position;

-- Check client_trainer_assignments table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'client_trainer_assignments'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('training_sessions', 'contracts', 'client_trainer_assignments', 'trainers')
ORDER BY tablename, policyname;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Calendar & Clients setup complete!';
  RAISE NOTICE '📅 Training sessions enhanced with new session types';
  RAISE NOTICE '👥 Client-trainer assignments table created';
  RAISE NOTICE '🔒 RLS policies configured for role-based access';
  RAISE NOTICE '🎨 Trainer calendar colors assigned';
  RAISE NOTICE '✨ Ready to use!';
END $$;
