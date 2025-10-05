-- ============================================
-- CLIENTS TABLE SETUP
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create clients table
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);

-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Admins can view all clients" ON clients;
DROP POLICY IF EXISTS "Trainers can view assigned clients" ON clients;
DROP POLICY IF EXISTS "Admins can manage clients" ON clients;
DROP POLICY IF EXISTS "Anyone authenticated can view clients" ON clients;

-- Admins can view all clients
CREATE POLICY "Admins can view all clients" ON clients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- For now: Allow any authenticated user to view clients
-- (Update this later when client_trainer_assignments table is created)
CREATE POLICY "Anyone authenticated can view clients" ON clients
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can manage all clients (INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can manage clients" ON clients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Clients table created successfully!';
  RAISE NOTICE '📋 Columns: id, created_at, updated_at, first_name, last_name, email, phone, date_of_birth';
  RAISE NOTICE '📋 Address: address_line1, address_line2, city, province, postal_code, country';
  RAISE NOTICE '📋 Emergency: emergency_contact_name, emergency_contact_phone, emergency_contact_relationship';
  RAISE NOTICE '📋 Health: medical_conditions, injuries, medications, fitness_goals';
  RAISE NOTICE '📋 Status: is_active, notes, created_by';
  RAISE NOTICE '🔒 RLS policies configured for admin and trainer access';
END $$;
