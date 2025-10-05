-- Check for constraints on contracts
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'contracts'::regclass;

-- Check for domains
SELECT domain_name, data_type
FROM information_schema.domains
WHERE domain_schema = 'public';
