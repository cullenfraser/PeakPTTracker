-- ============================================
-- DIAGNOSTIC: Check contracts table
-- ============================================

-- Check if start_date column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'contracts'
AND column_name IN ('start_date', 'end_date', 'client_id', 'trainer_id')
ORDER BY column_name;

-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'contracts';

-- Check for any active policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'contracts';

-- Check for triggers
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'contracts';
