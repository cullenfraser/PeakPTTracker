-- ============================================
-- STEP 2: CREATE TRIGGERS AND RLS POLICIES
-- Run this AFTER STEP1_CREATE_TABLES.sql
-- ============================================

-- ============================================
-- 1. ASSIGN TRAINER COLORS
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
-- 2. HELPER FUNCTIONS & TRIGGERS
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
    SET completed_sessions = COALESCE(completed_sessions, 0) + 1
    WHERE id = NEW.contract_id;
  ELSIF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    UPDATE contracts
    SET completed_sessions = GREATEST(COALESCE(completed_sessions, 0) - 1, 0)
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
-- 3. ENABLE RLS
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
-- 4. RLS POLICIES - ADMIN_USERS
-- ============================================

DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Super admins can manage admin users" ON admin_users;
DROP POLICY IF EXISTS "Users can view own admin record" ON admin_users;

-- Allow users to view their own admin record (prevents recursion)
CREATE POLICY "Users can view own admin record" ON admin_users
  FOR SELECT
  USING (user_id = auth.uid());

-- Super admins can manage all admin users
CREATE POLICY "Super admins can manage admin users" ON admin_users
  FOR ALL
  USING (
    user_id = auth.uid() AND role = 'super_admin'
  );

-- ============================================
-- 5. RLS POLICIES - TRAINERS
-- ============================================

DROP POLICY IF EXISTS "Everyone can view trainers" ON trainers;
DROP POLICY IF EXISTS "Trainers can view own record" ON trainers;
DROP POLICY IF EXISTS "Admins can manage trainers" ON trainers;

CREATE POLICY "Everyone can view trainers" ON trainers
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Trainers can view own record" ON trainers
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage trainers" ON trainers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. RLS POLICIES - CLIENTS
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
-- 7. RLS POLICIES - QUOTES
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
-- 8. RLS POLICIES - CONTRACTS
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
-- 9. RLS POLICIES - TRAINING_SESSIONS
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
-- 10. RLS POLICIES - CLIENT_TRAINER_ASSIGNMENTS
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
-- 11. RLS POLICIES - HOURS
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
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ STEP 2 COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📋 Triggers installed';
  RAISE NOTICE '🔒 RLS policies configured';
  RAISE NOTICE '🎨 Trainer colors assigned';
  RAISE NOTICE '';
  RAISE NOTICE '✨ Database setup complete and ready!';
END $$;
