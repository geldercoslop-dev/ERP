-- Migration: Fix counters unique constraint to be composite (tenant_id, name)
-- File: drizzle/0008_counters_tenant_unique_fix.sql
-- Date: 2026-05-06
--
-- This migration is real and conditional.
-- It removes the old global unique index on `name` if present.
-- It creates the composite unique index on (`tenant_id`, `name`) if missing.
-- It preserves counters_tenant_name_idx.
--
-- The migration is idempotent and works in both scenarios:
--   A. Database with old schema (has counters_name_unique) - will drop old, create new
--   B. Database already migrated (has counters_tenant_name_unique) - no changes needed

--> statement-breakpoint
SET @drop_name_unique_sql = NULL;

--> statement-breakpoint
SELECT CONCAT('ALTER TABLE `counters` DROP INDEX `', INDEX_NAME, '`')
INTO @drop_name_unique_sql
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'counters'
  AND INDEX_NAME = 'counters_name_unique'
LIMIT 1;

--> statement-breakpoint
SET @drop_stmt = IF(@drop_name_unique_sql IS NOT NULL, @drop_name_unique_sql, 'SELECT 1');

--> statement-breakpoint
PREPARE drop_stmt FROM @drop_stmt;

--> statement-breakpoint
EXECUTE drop_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE drop_stmt;

--> statement-breakpoint
SET @composite_exists = 0;

--> statement-breakpoint
SELECT COUNT(*)
INTO @composite_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'counters'
  AND INDEX_NAME = 'counters_tenant_name_unique';

--> statement-breakpoint
SET @create_stmt = IF(
  @composite_exists = 0,
  'ALTER TABLE `counters` ADD UNIQUE INDEX `counters_tenant_name_unique` (`tenant_id`, `name`)',
  'SELECT 1'
);

--> statement-breakpoint
PREPARE create_stmt FROM @create_stmt;

--> statement-breakpoint
EXECUTE create_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE create_stmt;
