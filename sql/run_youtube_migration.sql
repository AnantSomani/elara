-- ============================================================================
-- YouTube Database Migration - Master Script
-- 
-- This script runs the complete YouTube transcript database setup:
-- 1. Cleanup old tables
-- 2. Create new schema
-- 3. Create search functions
-- ============================================================================

\echo 'Starting YouTube Database Migration...'
\echo ''

-- Step 1: Cleanup old tables
\echo 'Step 1: Cleaning up old YouTube tables...'
\i 00_cleanup_old_youtube_tables.sql
\echo 'Cleanup completed!'
\echo ''

-- Step 2: Create new database schema
\echo 'Step 2: Creating YouTube database schema...'
\i 01_create_youtube_database.sql
\echo 'Database schema created!'
\echo ''

-- Step 3: Create search functions
\echo 'Step 3: Creating search functions...'
\i 02_create_search_functions.sql
\echo 'Search functions created!'
\echo ''

-- Final verification
\echo 'Migration completed! Verifying tables...'
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE tablename LIKE 'youtube_%'
ORDER BY tablename;

\echo ''
\echo 'YouTube Database Migration completed successfully!'
\echo 'Ready for 4-dimensional RAG system!' 