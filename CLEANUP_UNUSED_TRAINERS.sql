-- =====================================================================
-- CLEANUP UNUSED TRAINERS
-- =====================================================================
-- This script helps clean up trainer records that don't have user_id
-- and are blocking deletion due to foreign key constraints.
-- 
-- BEFORE RUNNING: Review which trainers you want to keep!
-- =====================================================================

BEGIN;

-- Step 1: Check which trainers don't have user_id
SELECT 
  id,
  first_name,
  last_name,
  email,
  user_id,
  (SELECT COUNT(*) FROM training_sessions WHERE trainer_id = trainers.id) as session_count,
  (SELECT COUNT(*) FROM contracts WHERE trainer_id = trainers.id) as contract_count,
  (SELECT COUNT(*) FROM client_trainer_assignments WHERE trainer_id = trainers.id) as assignment_count
FROM trainers
WHERE user_id IS NULL
ORDER BY first_name, last_name;

-- Step 2a: If you want to DELETE trainers with no sessions/contracts/assignments:
-- (Uncomment the lines below to execute)

/*
DELETE FROM client_trainer_assignments 
WHERE trainer_id IN (
  SELECT id FROM trainers WHERE user_id IS NULL
);

DELETE FROM training_sessions 
WHERE trainer_id IN (
  SELECT id FROM trainers WHERE user_id IS NULL
);

DELETE FROM contracts 
WHERE trainer_id IN (
  SELECT id FROM trainers WHERE user_id IS NULL
);

DELETE FROM trainers 
WHERE user_id IS NULL;
*/

-- Step 2b: OR reassign all their sessions/contracts to a valid trainer:
-- (Replace 'VALID_TRAINER_ID' with the UUID of the trainer you want to keep)

/*
DO $$
DECLARE
  valid_trainer_id uuid := 'VALID_TRAINER_ID'; -- Replace with your actual trainer ID
BEGIN
  -- Update training sessions
  UPDATE training_sessions
  SET trainer_id = valid_trainer_id
  WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);
  
  -- Update contracts
  UPDATE contracts
  SET trainer_id = valid_trainer_id
  WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);
  
  -- Update assignments
  UPDATE client_trainer_assignments
  SET trainer_id = valid_trainer_id
  WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id IS NULL);
  
  -- Now delete the unused trainers
  DELETE FROM trainers WHERE user_id IS NULL;
END $$;
*/

-- Don't commit yet - review the output first!
ROLLBACK;
-- If everything looks good, change ROLLBACK to COMMIT and re-run
