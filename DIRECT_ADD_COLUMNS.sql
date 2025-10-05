-- ============================================
-- DIRECT ADD - No conditionals, just add
-- ============================================

-- Add start_date column (will error if exists, that's OK)
ALTER TABLE contracts ADD COLUMN start_date DATE;

-- Add end_date column (will error if exists, that's OK)  
ALTER TABLE contracts ADD COLUMN end_date DATE;

-- Set default values
UPDATE contracts 
SET start_date = COALESCE(created_at::date, CURRENT_DATE)
WHERE start_date IS NULL;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contracts'
AND column_name IN ('start_date', 'end_date');
