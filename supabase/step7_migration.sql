-- =====================================================================
-- Step 7 migration: receipt footer message per shop
-- Run once in Supabase SQL Editor (after step6_migration.sql)
-- =====================================================================
alter table shops add column if not exists receipt_footer text;
