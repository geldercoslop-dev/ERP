CREATE TABLE `plano_contas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('DESPESA','RECEITA') NOT NULL,
	`categoria` varchar(100),
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plano_contas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contas_fixas` ADD `planoContasId` int;--> statement-breakpoint
ALTER TABLE `contas_pagar` ADD `planoContasId` int;--> statement-breakpoint
ALTER TABLE `contas_receber` ADD `planoContasId` int;--> statement-breakpoint
CREATE INDEX `nome_idx` ON `plano_contas` (`nome`);--> statement-breakpoint
CREATE INDEX `tipo_idx` ON `plano_contas` (`tipo`);--> statement-breakpoint
ALTER TABLE `contas_fixas` ADD CONSTRAINT `contas_fixas_planoContasId_plano_contas_id_fk` FOREIGN KEY (`planoContasId`) REFERENCES `plano_contas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_planoContasId_plano_contas_id_fk` FOREIGN KEY (`planoContasId`) REFERENCES `plano_contas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_planoContasId_plano_contas_id_fk` FOREIGN KEY (`planoContasId`) REFERENCES `plano_contas`(`id`) ON DELETE no action ON UPDATE no action;