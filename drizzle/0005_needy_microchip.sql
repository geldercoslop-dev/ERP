CREATE TABLE `leo_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`action_id` varchar(128) NOT NULL,
	`action` varchar(128) NOT NULL,
	`entity` varchar(128) NOT NULL,
	`description` text,
	`risk_level` varchar(32) NOT NULL,
	`payload_json` text,
	`status` varchar(32) NOT NULL DEFAULT 'PENDING',
	`requested_by` int,
	`approved_by` int,
	`approved_at` timestamp,
	`rejected_by` int,
	`rejected_at` timestamp,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leo_approvals_id` PRIMARY KEY(`id`),
	CONSTRAINT `leo_approvals_action_id_unique` UNIQUE(`action_id`)
);
--> statement-breakpoint
CREATE TABLE `produto_skus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`produto_id` int NOT NULL,
	`cor_id` int,
	`descricao_sku` varchar(255) NOT NULL,
	`sku_code` varchar(100),
	`tamanho` varchar(50),
	`tem_espelho` boolean NOT NULL DEFAULT false,
	`atributos_json` text,
	`estoque` int NOT NULL DEFAULT 0,
	`bloquear_estoque_negativo` boolean NOT NULL DEFAULT true,
	`acrescimo_custo` decimal(10,2) NOT NULL DEFAULT '0',
	`valor_venda` decimal(10,2),
	`ativo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `produto_skus_id` PRIMARY KEY(`id`),
	CONSTRAINT `produto_skus_unique` UNIQUE(`tenant_id`,`produto_id`,`cor_id`,`tamanho`,`tem_espelho`,`descricao_sku`)
);
--> statement-breakpoint
ALTER TABLE `produtos` ADD `bloquear_estoque_negativo` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `produto_skus` ADD CONSTRAINT `produto_skus_produto_id_produtos_id_fk` FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `produto_skus` ADD CONSTRAINT `produto_skus_cor_id_cores_id_fk` FOREIGN KEY (`cor_id`) REFERENCES `cores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `leo_approvals_tenant_id_idx` ON `leo_approvals` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `leo_approvals_status_idx` ON `leo_approvals` (`status`);--> statement-breakpoint
CREATE INDEX `leo_approvals_expires_at_idx` ON `leo_approvals` (`expires_at`);--> statement-breakpoint
CREATE INDEX `leo_approvals_tenant_status_idx` ON `leo_approvals` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `produto_skus_tenant_id_idx` ON `produto_skus` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `produto_skus_produto_id_idx` ON `produto_skus` (`produto_id`);--> statement-breakpoint
CREATE INDEX `produto_skus_cor_id_idx` ON `produto_skus` (`cor_id`);--> statement-breakpoint
CREATE INDEX `produto_skus_ativo_idx` ON `produto_skus` (`ativo`);--> statement-breakpoint
CREATE INDEX `produto_skus_tenant_produto_idx` ON `produto_skus` (`tenant_id`,`produto_id`);--> statement-breakpoint
CREATE INDEX `produto_skus_sku_code_idx` ON `produto_skus` (`sku_code`);