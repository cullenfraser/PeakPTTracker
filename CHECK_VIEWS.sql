-- Check for views that might reference contracts
SELECT table_name, view_definition 
FROM information_schema.views 
WHERE table_schema = 'public'
AND view_definition LIKE '%contracts%';

-- Check for materialized views
SELECT schemaname, matviewname, definition 
FROM pg_matviews 
WHERE schemaname = 'public';
