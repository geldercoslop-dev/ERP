-- Migration: FK física users.tenant_id / vendedores.tenant_id -> tenants.id
-- File: drizzle/0011_tenant_fks_users_vendedores.sql
-- Date: 2026-10-12
-- Context: P24D — deferido na migration 0009 (restore da master table tenants).
-- Agora que testes garantem tenant pai via ensureTenantExists (P24A/P24B1) e o
-- DB dev não tem órfãos (P24D audit), as FKs físicas podem ser criadas.
--
-- This migration is real and conditional.
-- A) Pre-step users: cria tenant pai para qualquer tenant_id órfão residual
--    (idempotente — LEFT JOIN + IS NULL insere 0 rows se já houver pai).
-- B) Pre-step vendedores: idem.
-- C) FK users.tenant_id -> tenants.id com ON DELETE/UPDATE RESTRICT.
-- D) FK vendedores.tenant_id -> tenants.id com ON DELETE/UPDATE RESTRICT.
--
-- Constraints são criadas via information_schema + PREPARE (MySQL não suporta
-- IF NOT EXISTS em ADD CONSTRAINT) — padrão da migration 0010.

--> statement-breakpoint
-- A) Pre-step users: garante tenant pai para todo tenant_id presente em users
INSERT INTO `tenants` (`id`, `nome_empresa`, `plano`, `status`)
SELECT DISTINCT u.`tenant_id`, CONCAT('Migrated Tenant ', u.`tenant_id`), 'default', 'ACTIVE'
FROM `users` u
LEFT JOIN `tenants` t ON t.`id` = u.`tenant_id`
WHERE t.`id` IS NULL;

--> statement-breakpoint
-- B) Pre-step vendedores: garante tenant pai para todo tenant_id presente em vendedores
INSERT INTO `tenants` (`id`, `nome_empresa`, `plano`, `status`)
SELECT DISTINCT v.`tenant_id`, CONCAT('Migrated Tenant ', v.`tenant_id`), 'default', 'ACTIVE'
FROM `vendedores` v
LEFT JOIN `tenants` t ON t.`id` = v.`tenant_id`
WHERE t.`id` IS NULL;

--> statement-breakpoint
-- C) FK users.tenant_id -> tenants.id (condicional)
SET @fk_users_sql = NULL;

--> statement-breakpoint
SELECT IF(
  COUNT(*) = 0,
  'ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
)
INTO @fk_users_sql
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND CONSTRAINT_NAME = 'users_tenant_id_tenants_id_fk';

--> statement-breakpoint
PREPARE fk_users_stmt FROM @fk_users_sql;

--> statement-breakpoint
EXECUTE fk_users_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE fk_users_stmt;

--> statement-breakpoint
-- D) FK vendedores.tenant_id -> tenants.id (condicional)
SET @fk_vendedores_sql = NULL;

--> statement-breakpoint
SELECT IF(
  COUNT(*) = 0,
  'ALTER TABLE `vendedores` ADD CONSTRAINT `vendedores_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
)
INTO @fk_vendedores_sql
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'vendedores'
  AND CONSTRAINT_NAME = 'vendedores_tenant_id_tenants_id_fk';

--> statement-breakpoint
PREPARE fk_vendedores_stmt FROM @fk_vendedores_sql;

--> statement-breakpoint
EXECUTE fk_vendedores_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE fk_vendedores_stmt;
