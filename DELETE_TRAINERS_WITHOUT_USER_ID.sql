-- =====================================================================
-- DELETE ALL TRAINERS WITHOUT user_id AND THEIR ASSOCIATED DATA
-- =====================================================================
-- WARNING: This will permanently delete trainers that don't have a user_id
-- and all their training sessions, contracts, and assignments.
-- =====================================================================

BEGIN;

-- First, let's see what we're about to delete
SELECT 'Trainers to be deleted:' as info;
SELECT 
  id,
  first_name,
  last_name,
  email,
  display_name
FROM trainers
WHERE user_id IS NULL;

SELECT 'Training sessions to be deleted:' as info;
SELECT COUNT(*) as count
FROM training_sessions
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

SELECT 'Contracts to be deleted:' as info;
SELECT COUNT(*) as count
FROM contracts
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

SELECT 'Client-trainer assignments to be deleted:' as info;
SELECT COUNT(*) as count
FROM client_trainer_assignments
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

SELECT 'Payroll entries to be deleted:' as info;
SELECT COUNT(*) as count
FROM payroll_entries
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

-- Now delete in correct order (respecting foreign key constraints)

-- 1. Delete contract schedule entries (references contracts)
DELETE FROM contract_schedule_entries
WHERE contract_id IN (
  SELECT id FROM contracts WHERE trainer_id IN (
    SELECT id FROM trainers WHERE user_id IS NULL
  )
);

-- 2. Delete contract participants (references contracts)
DELETE FROM contract_participants
WHERE contract_id IN (
  SELECT id FROM contracts WHERE trainer_id IN (
    SELECT id FROM trainers WHERE user_id IS NULL
  )
);

-- 3. Delete training sessions
DELETE FROM training_sessions
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

-- 4. Delete client-trainer assignments
DELETE FROM client_trainer_assignments
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

-- 5. Delete payroll entries
DELETE FROM payroll_entries
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

-- 6. Delete trainer payroll records
DELETE FROM trainer_payroll
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

-- 7. Delete contracts
DELETE FROM contracts
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

-- 8. Delete hours records
DELETE FROM hours
WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);

-- 9. Finally, delete the trainers themselves
DELETE FROM trainers
WHERE user_id IS NULL;

-- Show final count of remaining trainers
SELECT 'Remaining trainers:' as info;
SELECT 
  id,
  first_name,
  last_name,
  email,
  user_id,
  CASE WHEN user_id IS NOT NULL THEN '✓ Has login' ELSE '✗ No login' END as status
FROM trainers
ORDER BY first_name, last_name;

-- REVIEW THE OUTPUT ABOVE CAREFULLY!
-- If everything looks good, change ROLLBACK to COMMIT and run again
ROLLBACK;
-- COMMIT;  -- Uncomment this line and comment out ROLLBACK above when ready to commit
