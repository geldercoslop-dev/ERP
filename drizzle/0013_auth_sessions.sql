-- Migration: Auth — tabela oficial de sessões persistidas (DB-backed auth)
-- File: drizzle/0013_auth_sessions.sql
-- Context: AUTH-H4 / AUTH_DB_SESSION_V1 — sessão persistida para auth:
-- sessionId único (claim JWT), refresh token apenas com hash (nunca puro),
-- rotação de refresh, revogação server-side (revoked_at/revoked_reason),
-- expiração (refresh_token_expires_at) e auditoria de uso (last_used_at).
-- FKs: tenant_id → tenants.id, user_id → users.id, vendedor_id → vendedores.id.

CREATE TABLE `auth_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` varchar(64) NOT NULL,
	`tenant_id` int NOT NULL,
	`user_id` int NOT NULL,
	`vendedor_id` int,
	`role` enum('admin','operator','user') NOT NULL,
	`refresh_token_hash` varchar(255) NOT NULL,
	`refresh_token_expires_at` datetime NOT NULL,
	`revoked_at` datetime,
	`revoked_reason` varchar(255),
	`last_used_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_session_id_unique` UNIQUE(`session_id`)
);
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_vendedor_id_vendedores_id_fk` FOREIGN KEY (`vendedor_id`) REFERENCES `vendedores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_sessions_tenant_id_idx` ON `auth_sessions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_id_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_vendedor_id_idx` ON `auth_sessions` (`vendedor_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_refresh_token_hash_idx` ON `auth_sessions` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_revoked_at_idx` ON `auth_sessions` (`revoked_at`);