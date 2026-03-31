CREATE TABLE `contas_fixas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`categoria` varchar(100),
	`fornecedorId` int,
	`valor` decimal(10,2) NOT NULL DEFAULT '0',
	`diaVencimento` int NOT NULL,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_fixas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contas_pagar` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contaFixaId` int,
	`fornecedorId` int,
	`descricao` varchar(255) NOT NULL,
	`categoria` varchar(100),
	`valor` decimal(10,2) NOT NULL DEFAULT '0',
	`dataVencimento` varchar(10) NOT NULL,
	`dataPagamento` varchar(10),
	`status` enum('PENDENTE','PAGA','VENCIDA') NOT NULL DEFAULT 'PENDENTE',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_pagar_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contas_receber` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` int,
	`clienteId` int,
	`clienteNome` varchar(255) NOT NULL,
	`descricao` varchar(255) NOT NULL,
	`valor` decimal(10,2) NOT NULL DEFAULT '0',
	`dataVencimento` varchar(10) NOT NULL,
	`dataRecebimento` varchar(10),
	`status` enum('PENDENTE','RECEBIDA','VENCIDA') NOT NULL DEFAULT 'PENDENTE',
	`formaPagamento` varchar(50),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_receber_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fornecedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`telefone` varchar(20),
	`email` varchar(320),
	`tipo` varchar(100),
	`observacoes` text,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fornecedores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contas_fixas` ADD CONSTRAINT `contas_fixas_fornecedorId_fornecedores_id_fk` FOREIGN KEY (`fornecedorId`) REFERENCES `fornecedores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_contaFixaId_contas_fixas_id_fk` FOREIGN KEY (`contaFixaId`) REFERENCES `contas_fixas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_fornecedorId_fornecedores_id_fk` FOREIGN KEY (`fornecedorId`) REFERENCES `fornecedores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_pedidoId_pedidos_id_fk` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_clienteId_clientes_id_fk` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `status_idx` ON `contas_pagar` (`status`);--> statement-breakpoint
CREATE INDEX `vencimento_idx` ON `contas_pagar` (`dataVencimento`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `contas_receber` (`status`);--> statement-breakpoint
CREATE INDEX `vencimento_idx` ON `contas_receber` (`dataVencimento`);--> statement-breakpoint
CREATE INDEX `cliente_idx` ON `contas_receber` (`clienteId`);--> statement-breakpoint
CREATE INDEX `nome_idx` ON `fornecedores` (`nome`);