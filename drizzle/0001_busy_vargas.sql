CREATE TABLE `cargas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`numero` int NOT NULL,
	`cidadeRota` varchar(100),
	`dataEntrega` varchar(10),
	`status` enum('ABERTA','BAIXADA') NOT NULL DEFAULT 'ABERTA',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cargas_id` PRIMARY KEY(`id`),
	CONSTRAINT `cargas_numero_unique` UNIQUE(`numero`)
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`telefone` varchar(20),
	`telefoneRecado` varchar(20),
	`rua` text,
	`numero` varchar(20),
	`bairro` varchar(100),
	`cidade` varchar(100),
	`uf` varchar(2),
	`referencia` text,
	`condominio` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comissoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vendedorId` int NOT NULL,
	`pedidoId` int NOT NULL,
	`cargaId` int,
	`valorVenda` decimal(10,2) NOT NULL DEFAULT '0',
	`percentualComissao` decimal(5,2) NOT NULL DEFAULT '0',
	`valorComissao` decimal(10,2) NOT NULL DEFAULT '0',
	`status` enum('PENDENTE','PAGA') NOT NULL DEFAULT 'PENDENTE',
	`dataPagamento` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comissoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `counters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`seq` int NOT NULL DEFAULT 0,
	`free` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `counters_id` PRIMARY KEY(`id`),
	CONSTRAINT `counters_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `grupos_precificacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`percentualMontagem` decimal(5,2) NOT NULL DEFAULT '0',
	`percentualLucro` decimal(5,2) NOT NULL DEFAULT '0',
	`percentualComissao` decimal(5,2) NOT NULL DEFAULT '0',
	`percentualCartao` decimal(5,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `grupos_precificacao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `itens_pedido` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` int NOT NULL,
	`tipo` enum('LIVRE','CATALOGO') NOT NULL DEFAULT 'LIVRE',
	`produtoId` int,
	`corId` int,
	`corNome` varchar(100),
	`descricao` text NOT NULL,
	`marca` varchar(255),
	`quantidade` int NOT NULL DEFAULT 1,
	`valorUnitario` decimal(10,2) NOT NULL DEFAULT '0',
	`custo` decimal(10,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `itens_pedido_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedidos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`numero` int NOT NULL,
	`vendedorId` int NOT NULL,
	`clienteId` int NOT NULL,
	`clienteNome` varchar(255) NOT NULL,
	`clienteTelefone` varchar(20),
	`clienteTelefoneRecado` varchar(20),
	`clienteRua` text,
	`clienteNumero` varchar(20),
	`clienteBairro` varchar(100),
	`clienteCidade` varchar(100),
	`clienteUf` varchar(2),
	`clienteReferencia` text,
	`clienteCondominio` text,
	`subtotal` decimal(10,2) NOT NULL DEFAULT '0',
	`desconto` decimal(10,2) NOT NULL DEFAULT '0',
	`acrescimo` decimal(10,2) NOT NULL DEFAULT '0',
	`total` decimal(10,2) NOT NULL DEFAULT '0',
	`status` enum('GERADO','IMPRESSO','ENTREGUE','CANCELADO') NOT NULL DEFAULT 'GERADO',
	`formaPagamento` varchar(50),
	`dataEntrega` timestamp,
	`garantiaInicio` timestamp,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedidos_id` PRIMARY KEY(`id`),
	CONSTRAINT `pedidos_numero_unique` UNIQUE(`numero`)
);
--> statement-breakpoint
CREATE TABLE `pedidos_carga` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cargaId` int NOT NULL,
	`pedidoId` int NOT NULL,
	`numeroPedido` int NOT NULL,
	`clienteNome` varchar(255) NOT NULL,
	`valorTotal` decimal(10,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pedidos_carga_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pendencias_compra` (
	`id` int AUTO_INCREMENT NOT NULL,
	`produtoId` int,
	`descricao` text NOT NULL,
	`quantidade` int NOT NULL DEFAULT 1,
	`status` enum('PENDENTE','COMPRADO','CHEGOU') NOT NULL DEFAULT 'PENDENTE',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pendencias_compra_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `produtos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`descricao` text NOT NULL,
	`marca` varchar(255),
	`fornecedor` varchar(255),
	`categoria` varchar(100),
	`custo` decimal(10,2) NOT NULL DEFAULT '0',
	`estoque` int NOT NULL DEFAULT 0,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `produtos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`nome` varchar(255) NOT NULL,
	`telefone` varchar(20),
	`email` varchar(320),
	`senha` varchar(255),
	`admin` boolean NOT NULL DEFAULT false,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendedores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `comissoes` ADD CONSTRAINT `comissoes_vendedorId_vendedores_id_fk` FOREIGN KEY (`vendedorId`) REFERENCES `vendedores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comissoes` ADD CONSTRAINT `comissoes_pedidoId_pedidos_id_fk` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comissoes` ADD CONSTRAINT `comissoes_cargaId_cargas_id_fk` FOREIGN KEY (`cargaId`) REFERENCES `cargas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `itens_pedido` ADD CONSTRAINT `itens_pedido_pedidoId_pedidos_id_fk` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `itens_pedido` ADD CONSTRAINT `itens_pedido_produtoId_produtos_id_fk` FOREIGN KEY (`produtoId`) REFERENCES `produtos`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `itens_pedido` ADD CONSTRAINT `itens_pedido_corId_cores_id_fk` FOREIGN KEY (`corId`) REFERENCES `cores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_vendedorId_vendedores_id_fk` FOREIGN KEY (`vendedorId`) REFERENCES `vendedores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_clienteId_clientes_id_fk` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pedidos_carga` ADD CONSTRAINT `pedidos_carga_cargaId_cargas_id_fk` FOREIGN KEY (`cargaId`) REFERENCES `cargas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pedidos_carga` ADD CONSTRAINT `pedidos_carga_pedidoId_pedidos_id_fk` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pendencias_compra` ADD CONSTRAINT `pendencias_compra_produtoId_produtos_id_fk` FOREIGN KEY (`produtoId`) REFERENCES `produtos`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendedores` ADD CONSTRAINT `vendedores_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `status_idx` ON `cargas` (`status`);--> statement-breakpoint
CREATE INDEX `numero_idx` ON `cargas` (`numero`);--> statement-breakpoint
CREATE INDEX `nome_idx` ON `clientes` (`nome`);--> statement-breakpoint
CREATE INDEX `telefone_idx` ON `clientes` (`telefone`);--> statement-breakpoint
CREATE INDEX `vendedor_idx` ON `comissoes` (`vendedorId`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `comissoes` (`status`);--> statement-breakpoint
CREATE INDEX `pedido_idx` ON `comissoes` (`pedidoId`);--> statement-breakpoint
CREATE INDEX `pedido_idx` ON `itens_pedido` (`pedidoId`);--> statement-breakpoint
CREATE INDEX `vendedor_idx` ON `pedidos` (`vendedorId`);--> statement-breakpoint
CREATE INDEX `cliente_idx` ON `pedidos` (`clienteId`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `pedidos` (`status`);--> statement-breakpoint
CREATE INDEX `numero_idx` ON `pedidos` (`numero`);--> statement-breakpoint
CREATE INDEX `carga_idx` ON `pedidos_carga` (`cargaId`);--> statement-breakpoint
CREATE INDEX `pedido_idx` ON `pedidos_carga` (`pedidoId`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `pendencias_compra` (`status`);--> statement-breakpoint
CREATE INDEX `marca_idx` ON `produtos` (`marca`);--> statement-breakpoint
CREATE INDEX `nome_idx` ON `vendedores` (`nome`);