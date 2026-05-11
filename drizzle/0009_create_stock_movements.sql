-- Migration: Create stock_movements table
-- File: drizzle/0009_create_stock_movements.sql
-- Date: 2026-05-10
--
-- This migration creates the stock_movements table to track all stock movements
-- with proper tenant isolation and product references.
-- This migration is idempotent and works in both scenarios:
--   A. Database without stock_movements table - will create table and indexes
--   B. Database already has stock_movements table - no changes needed

--> statement-breakpoint
SET @create_table_sql = NULL;

--> statement-breakpoint
SELECT CONCAT('CREATE TABLE `stock_movements` (
	`id` int PRIMARY KEY AUTO_INCREMENT,
	`tenant_id` int NOT NULL,
	`produto_id` int NOT NULL,
	`descricao` text NOT NULL,
	`quantidade` int NOT NULL,
	`tipo` enum(''entrada'', ''saida'') NOT NULL,
	`estoque_anterior` int NOT NULL,
	`estoque_novo` int NOT NULL,
	`motivo` text NOT NULL,
	`usuario` varchar(255) NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `stock_movements_produto_id_fk` FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON UPDATE no action ON DELETE no action
)')
INTO @create_table_sql
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'stock_movements'
LIMIT 1;

--> statement-breakpoint
SET @create_stmt = IF(@create_table_sql IS NULL, 'CREATE TABLE `stock_movements` (
	`id` int PRIMARY KEY AUTO_INCREMENT,
	`tenant_id` int NOT NULL,
	`produto_id` int NOT NULL,
	`descricao` text NOT NULL,
	`quantidade` int NOT NULL,
	`tipo` enum(''entrada'', ''saida'') NOT NULL,
	`estoque_anterior` int NOT NULL,
	`estoque_novo` int NOT NULL,
	`motivo` text NOT NULL,
	`usuario` varchar(255) NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `stock_movements_produto_id_fk` FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON UPDATE no action ON DELETE no action
)', 'SELECT 1');

--> statement-breakpoint
PREPARE create_stmt FROM @create_stmt;

--> statement-breakpoint
EXECUTE create_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE create_stmt;

--> statement-breakpoint
SET @idx_exists = 0;

--> statement-breakpoint
SELECT COUNT(*)
INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'stock_movements'
  AND INDEX_NAME = 'stock_movements_tenant_id_idx';

--> statement-breakpoint
SET @create_idx_stmt = IF(
  @idx_exists = 0,
  'CREATE INDEX `stock_movements_tenant_id_idx` ON `stock_movements` (`tenant_id`)',
  'SELECT 1'
);

--> statement-breakpoint
PREPARE create_idx_stmt FROM @create_idx_stmt;

--> statement-breakpoint
EXECUTE create_idx_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE create_idx_stmt;

--> statement-breakpoint
SET @idx_exists = 0;

--> statement-breakpoint
SELECT COUNT(*)
INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'stock_movements'
  AND INDEX_NAME = 'stock_movements_produto_id_idx';

--> statement-breakpoint
SET @create_idx_stmt = IF(
  @idx_exists = 0,
  'CREATE INDEX `stock_movements_produto_id_idx` ON `stock_movements` (`produto_id`)',
  'SELECT 1'
);

--> statement-breakpoint
PREPARE create_idx_stmt FROM @create_idx_stmt;

--> statement-breakpoint
EXECUTE create_idx_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE create_idx_stmt;

--> statement-breakpoint
SET @idx_exists = 0;

--> statement-breakpoint
SELECT COUNT(*)
INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'stock_movements'
  AND INDEX_NAME = 'stock_movements_timestamp_idx';

--> statement-breakpoint
SET @create_idx_stmt = IF(
  @idx_exists = 0,
  'CREATE INDEX `stock_movements_timestamp_idx` ON `stock_movements` (`timestamp`)',
  'SELECT 1'
);

--> statement-breakpoint
PREPARE create_idx_stmt FROM @create_idx_stmt;

--> statement-breakpoint
EXECUTE create_idx_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE create_idx_stmt;

--> statement-breakpoint
SET @idx_exists = 0;

--> statement-breakpoint
SELECT COUNT(*)
INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'stock_movements'
  AND INDEX_NAME = 'stock_movements_tenant_produto_idx';

--> statement-breakpoint
SET @create_idx_stmt = IF(
  @idx_exists = 0,
  'CREATE INDEX `stock_movements_tenant_produto_idx` ON `stock_movements` (`tenant_id`, `produto_id`)',
  'SELECT 1'
);

--> statement-breakpoint
PREPARE create_idx_stmt FROM @create_idx_stmt;

--> statement-breakpoint
EXECUTE create_idx_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE create_idx_stmt;
