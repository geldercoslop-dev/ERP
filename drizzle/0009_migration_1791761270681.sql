-- Custom SQL migration file, put your code below! --

-- Restaura a master table `tenants` conforme baseline (.audit/baseline-inspection):
-- id PK, nome_empresa, status enum, timestamps, indexes nome_empresa/status.
-- Adicional: `plano` NULL — coluna usada por server/scripts/seed-tenant.ts.
-- SEM FOREIGN KEY: testes usam tenantIds arbitrarios sem row correspondente;
-- FKs fisicas (users/vendedores -> tenants) ficam para follow-up dedicado.
CREATE TABLE IF NOT EXISTS `tenants` (
	`id` int NOT NULL AUTO_INCREMENT,
	`nome_empresa` varchar(255) NOT NULL,
	`plano` varchar(50),
	`status` enum('ACTIVE','SUSPENDED','DELETED') NOT NULL DEFAULT 'ACTIVE',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	INDEX `tenants_nome_empresa_idx` (`nome_empresa`),
	INDEX `tenants_status_idx` (`status`)
);
--> statement-breakpoint
-- Tenant default (id=1) exigido pelo contrato (schema-consistency test + guards).
-- Idempotente: ON DUPLICATE KEY UPDATE evita erro em re-aplicacoes/DBs já seedados.
INSERT INTO `tenants` (`id`, `nome_empresa`, `plano`, `status`)
VALUES (1, 'GRS Móveis', 'default', 'ACTIVE')
ON DUPLICATE KEY UPDATE
	`nome_empresa` = VALUES(`nome_empresa`),
	`plano` = VALUES(`plano`),
	`status` = VALUES(`status`);