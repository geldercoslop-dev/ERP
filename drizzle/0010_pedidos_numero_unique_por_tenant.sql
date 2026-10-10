-- Migration: Fix pedidos unique constraint to be composite (tenant_id, numero)
-- File: drizzle/0010_pedidos_numero_unique_por_tenant.sql
-- Date: 2026-10-10
-- Context: P7C — pedidos.numero era unique global, mas createPedidoSafe gera
-- numero por contador por tenant (counters). Qualquer tenant novo cujo primeiro
-- pedido gere numero=1 colidia com numero=1 de outro tenant (ER_DUP_ENTRY).
-- Decisão P7B: Opção A — unique composta, contador por tenant preservado.
--
-- This migration is real and conditional.
-- It removes the old global unique index on `numero` if present.
-- It creates the composite unique index on (`tenant_id`, `numero`) if missing.
-- It preserves pedidos_numero_idx (non-unique) and pedidos_tenant_id_idx.
--
-- The migration is idempotent and works in both scenarios:
--   A. Database with old schema (has pedidos_numero_unique) - will drop old, create new
--   B. Database already migrated (has pedidos_tenant_numero_unique) - no changes needed

--> statement-breakpoint
SET @drop_numero_unique_sql = NULL;

--> statement-breakpoint
SELECT CONCAT('ALTER TABLE `pedidos` DROP INDEX `', INDEX_NAME, '`')
INTO @drop_numero_unique_sql
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pedidos'
  AND INDEX_NAME = 'pedidos_numero_unique'
LIMIT 1;

--> statement-breakpoint
SET @drop_stmt = IF(@drop_numero_unique_sql IS NOT NULL, @drop_numero_unique_sql, 'SELECT 1');

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
  AND TABLE_NAME = 'pedidos'
  AND INDEX_NAME = 'pedidos_tenant_numero_unique';

--> statement-breakpoint
SET @create_stmt = IF(
  @composite_exists = 0,
  'ALTER TABLE `pedidos` ADD UNIQUE INDEX `pedidos_tenant_numero_unique` (`tenant_id`, `numero`)',
  'SELECT 1'
);

--> statement-breakpoint
PREPARE create_stmt FROM @create_stmt;

--> statement-breakpoint
EXECUTE create_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE create_stmt;
