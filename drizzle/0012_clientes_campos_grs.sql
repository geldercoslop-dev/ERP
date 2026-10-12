-- Migration: Clientes — campos GRS + unique por tenant
-- File: drizzle/0012_clientes_campos_grs.sql
-- Date: 2026-10-12
-- Context: P28B — alinhar `clientes` à regra GRS de cadastro
-- (cep, cpf, data_nascimento, observacao, situacao) e corrigir a unique
-- de cliente para ser por tenant (a antiga era global e podia colidir
-- entre tenants com mesmo telefone+nome normalizados).
--
-- This migration is real, conditional and idempotent.
-- A) Colunas novas criadas apenas se ausentes (information_schema.COLUMNS).
-- B) Unique antiga `clientes_telefone_nome_sobrenome_unique` dropada se presente.
-- C) Unique nova `clientes_tenant_telefone_nome_sobrenome_unique` criada se ausente.
--
-- Ordem segura (validada em P28A — 0 duplicados globais e por tenant):
--   checar duplicidades -> dropar unique antiga -> criar unique nova com tenant_id.
--
-- Funciona nos dois cenários:
--   A. Banco com schema antigo (tem unique global) - drop + create
--   B. Banco já migrado (tem unique por tenant) - nenhuma alteração

--> statement-breakpoint
-- A) Colunas novas (condicionais)
SET @add_cep = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `clientes` ADD `cep` varchar(9)',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'clientes'
    AND COLUMN_NAME = 'cep'
);

--> statement-breakpoint
PREPARE add_cep_stmt FROM @add_cep;

--> statement-breakpoint
EXECUTE add_cep_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE add_cep_stmt;

--> statement-breakpoint
SET @add_cpf = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `clientes` ADD `cpf` varchar(14)',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'clientes'
    AND COLUMN_NAME = 'cpf'
);

--> statement-breakpoint
PREPARE add_cpf_stmt FROM @add_cpf;

--> statement-breakpoint
EXECUTE add_cpf_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE add_cpf_stmt;

--> statement-breakpoint
SET @add_data_nascimento = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `clientes` ADD `data_nascimento` date',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'clientes'
    AND COLUMN_NAME = 'data_nascimento'
);

--> statement-breakpoint
PREPARE add_dn_stmt FROM @add_data_nascimento;

--> statement-breakpoint
EXECUTE add_dn_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE add_dn_stmt;

--> statement-breakpoint
SET @add_observacao = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `clientes` ADD `observacao` text',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'clientes'
    AND COLUMN_NAME = 'observacao'
);

--> statement-breakpoint
PREPARE add_obs_stmt FROM @add_observacao;

--> statement-breakpoint
EXECUTE add_obs_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE add_obs_stmt;

--> statement-breakpoint
SET @add_situacao = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `clientes` ADD `situacao` enum(''ATIVO'',''INATIVO'',''PROSPECT'') DEFAULT ''ATIVO'' NOT NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'clientes'
    AND COLUMN_NAME = 'situacao'
);

--> statement-breakpoint
PREPARE add_sit_stmt FROM @add_situacao;

--> statement-breakpoint
EXECUTE add_sit_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE add_sit_stmt;

--> statement-breakpoint
-- B) Drop da unique global antiga (condicional)
SET @drop_unique_sql = NULL;

--> statement-breakpoint
SELECT CONCAT('ALTER TABLE `clientes` DROP INDEX `', INDEX_NAME, '`')
INTO @drop_unique_sql
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'clientes'
  AND INDEX_NAME = 'clientes_telefone_nome_sobrenome_unique'
LIMIT 1;

--> statement-breakpoint
SET @drop_unique_stmt = IF(@drop_unique_sql IS NOT NULL, @drop_unique_sql, 'SELECT 1');

--> statement-breakpoint
PREPARE drop_u_stmt FROM @drop_unique_stmt;

--> statement-breakpoint
EXECUTE drop_u_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE drop_u_stmt;

--> statement-breakpoint
-- C) Create da unique por tenant (condicional)
SET @tenant_unique_exists = 0;

--> statement-breakpoint
SELECT COUNT(*)
INTO @tenant_unique_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'clientes'
  AND INDEX_NAME = 'clientes_tenant_telefone_nome_sobrenome_unique';

--> statement-breakpoint
SET @create_unique_stmt = IF(
  @tenant_unique_exists = 0,
  'ALTER TABLE `clientes` ADD CONSTRAINT `clientes_tenant_telefone_nome_sobrenome_unique` UNIQUE(`tenant_id`,`telefone_norm`,`nome_norm`,`sobrenome_norm`)',
  'SELECT 1'
);

--> statement-breakpoint
PREPARE create_u_stmt FROM @create_unique_stmt;

--> statement-breakpoint
EXECUTE create_u_stmt;

--> statement-breakpoint
DEALLOCATE PREPARE create_u_stmt;