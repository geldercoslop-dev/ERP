CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`actor_user_id` int,
	`actor_vendedor_id` int,
	`action` varchar(32) NOT NULL,
	`entity` varchar(64) NOT NULL,
	`entity_id` varchar(64),
	`payload_json` text,
	`trace_id` varchar(32),
	`ip` varchar(45),
	`user_agent` text,
	`severity` varchar(10) NOT NULL DEFAULT 'INFO',
	`source` varchar(20) NOT NULL DEFAULT 'api',
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `boletos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`pedido_id` int NOT NULL,
	`cliente_id` int NOT NULL,
	`vendedor_id` int NOT NULL,
	`numero_pedido` int NOT NULL,
	`valor_original` decimal(10,2) NOT NULL,
	`valor_aberto` decimal(10,2) NOT NULL,
	`data_vencimento` timestamp NOT NULL,
	`status` varchar(50) NOT NULL,
	`codigo_barras` varchar(100),
	`pix_copia_e_cola` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `boletos_id` PRIMARY KEY(`id`)
);

CREATE TABLE `caixa_mensal` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`mes_ano` varchar(7) NOT NULL,
	`total_pix` decimal(12,2) NOT NULL DEFAULT '0',
	`total_boleto` decimal(12,2) NOT NULL DEFAULT '0',
	`total_cartao` decimal(12,2) NOT NULL DEFAULT '0',
	`total_dinheiro` decimal(12,2) NOT NULL DEFAULT '0',
	`total_geral` decimal(12,2) NOT NULL DEFAULT '0',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `caixa_mensal_id` PRIMARY KEY(`id`),
	CONSTRAINT `caixa_mensal_tenant_mes_ano_idx` UNIQUE(`tenant_id`,`mes_ano`)
);

CREATE TABLE `cargas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`numero` int NOT NULL,
	`cidade_rota` varchar(100),
	`data_entrega` timestamp,
	`status` varchar(50) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cargas_id` PRIMARY KEY(`id`),
	CONSTRAINT `cargas_numero_unique` UNIQUE(`numero`)
);

CREATE TABLE `cliente_vendedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`cliente_id` int NOT NULL,
	`vendedor_id` int NOT NULL,
	`tipo` enum('PRINCIPAL','SECUNDARIO') NOT NULL DEFAULT 'PRINCIPAL',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cliente_vendedores_id` PRIMARY KEY(`id`),
	CONSTRAINT `cliente_vendedor_unique` UNIQUE(`cliente_id`,`vendedor_id`)
);

CREATE TABLE `clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`telefone` varchar(20),
	`telefone_norm` varchar(32) NOT NULL,
	`nome_norm` varchar(120) NOT NULL,
	`sobrenome_norm` varchar(120) NOT NULL,
	`telefone_recado` varchar(20),
	`rua` text,
	`numero` varchar(20),
	`bairro` varchar(100),
	`cidade` varchar(100),
	`uf` varchar(2),
	`referencia` text,
	`condominio` text,
	`bloco` varchar(50),
	`apartamento` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`),
	CONSTRAINT `clientes_telefone_nome_sobrenome_unique` UNIQUE(`telefone_norm`,`nome_norm`,`sobrenome_norm`)
);

CREATE TABLE `comissoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`vendedor_id` int NOT NULL,
	`pedido_id` int NOT NULL,
	`carga_id` int,
	`valor_venda` decimal(10,2) NOT NULL DEFAULT '0',
	`percentual_comissao` decimal(5,2) NOT NULL DEFAULT '0',
	`valor_comissao` decimal(10,2) NOT NULL DEFAULT '0',
	`status` varchar(50) NOT NULL,
	`data_pagamento` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comissoes_id` PRIMARY KEY(`id`)
);

CREATE TABLE `configuracoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chave` varchar(64) NOT NULL,
	`valor` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `configuracoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `configuracoes_chave_unique` UNIQUE(`chave`)
);

CREATE TABLE `contas_fixas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`nome` varchar(255),
	`descricao` varchar(255),
	`valor` decimal(10,2) NOT NULL,
	`dia_vencimento` int NOT NULL,
	`fornecedor_id` int,
	`plano_contas_id` int,
	`ativo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_fixas_id` PRIMARY KEY(`id`)
);

CREATE TABLE `contas_pagar` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`conta_fixa_id` int,
	`fornecedor_id` int,
	`descricao` varchar(255) NOT NULL,
	`valor` decimal(10,2) NOT NULL,
	`data_vencimento` timestamp NOT NULL,
	`status` varchar(50) NOT NULL,
	`data_pagamento` timestamp,
	`plano_contas_id` int,
	`fornecedor` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_pagar_id` PRIMARY KEY(`id`)
);

CREATE TABLE `contas_receber` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`pedido_id` int,
	`pedido_numero` int,
	`cliente_id` int,
	`cliente_nome` varchar(255) NOT NULL,
	`vendedor_id` int,
	`descricao` varchar(255) NOT NULL,
	`valor` decimal(10,2) NOT NULL,
	`data_vencimento` timestamp NOT NULL,
	`status` varchar(50) NOT NULL,
	`data_recebimento` timestamp,
	`forma_pagamento` enum('PIX','BOLETO','CARTAO','DINHEIRO'),
	`observacoes` text,
	`plano_contas_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_receber_id` PRIMARY KEY(`id`)
);

CREATE TABLE `cores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`nome` varchar(100) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cores_id` PRIMARY KEY(`id`)
);

CREATE TABLE `counters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(50) NOT NULL,
	`seq` int NOT NULL DEFAULT 0,
	`free` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `counters_id` PRIMARY KEY(`id`),
	CONSTRAINT `counters_name_unique` UNIQUE(`name`)
);

CREATE TABLE `financial_idempotency` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`operation_key` varchar(255) NOT NULL,
	`operation_type` enum('BAIXA_BOLETO','CREDITO_CAIXA') NOT NULL,
	`processed_at` timestamp NOT NULL DEFAULT (now()),
	`metadata` text,
	CONSTRAINT `financial_idempotency_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_operation_idx` UNIQUE(`tenant_id`,`operation_key`,`operation_type`)
);

CREATE TABLE `fornecedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`telefone` varchar(20),
	`email` varchar(320),
	`tipo` varchar(100),
	`observacoes` text,
	`ativo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fornecedores_id` PRIMARY KEY(`id`)
);

CREATE TABLE `grupos_precificacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`desconto_fabrica` decimal(5,2) NOT NULL DEFAULT '0',
	`ipi` decimal(5,2) NOT NULL DEFAULT '0',
	`frete` decimal(10,2) NOT NULL DEFAULT '0',
	`montagem` decimal(10,2) NOT NULL DEFAULT '0',
	`lucro` decimal(10,2) NOT NULL DEFAULT '0',
	`comissao` decimal(5,2) NOT NULL DEFAULT '0',
	`juros_cartao` decimal(5,2) NOT NULL DEFAULT '0',
	`prazo_garantia` int NOT NULL DEFAULT 90,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `grupos_precificacao_id` PRIMARY KEY(`id`)
);

CREATE TABLE `idempotency_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`key` varchar(64) NOT NULL,
	`command_name` varchar(64) NOT NULL,
	`result_json` text,
	`trace_id` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `idempotency_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `idempotency_cmd_key` UNIQUE(`command_name`,`key`)
);

CREATE TABLE `itens_pedido` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`pedido_id` int NOT NULL,
	`tipo` enum('LIVRE','CATALOGO') NOT NULL DEFAULT 'LIVRE',
	`produto_id` int,
	`cor_id` int,
	`cor_nome` varchar(100),
	`descricao` text NOT NULL,
	`marca` varchar(255),
	`quantidade` int NOT NULL DEFAULT 1,
	`valor_unitario` decimal(10,2) NOT NULL DEFAULT '0',
	`custo` decimal(10,2) NOT NULL DEFAULT '0',
	`prazo_garantia` int NOT NULL DEFAULT 90,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `itens_pedido_id` PRIMARY KEY(`id`)
);

CREATE TABLE `pedidos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`numero` int NOT NULL,
	`vendedor_id` int NOT NULL,
	`cliente_id` int NOT NULL,
	`cliente_nome` varchar(255) NOT NULL,
	`cliente_telefone` varchar(20),
	`cliente_telefone_recado` varchar(20),
	`cliente_rua` text,
	`cliente_numero` varchar(20),
	`cliente_bairro` varchar(100),
	`cliente_cidade` varchar(100),
	`cliente_uf` varchar(2),
	`cliente_referencia` text,
	`cliente_condominio` text,
	`cliente_bloco` varchar(50),
	`cliente_apartamento` varchar(50),
	`subtotal` decimal(10,2) NOT NULL DEFAULT '0',
	`desconto` decimal(10,2) NOT NULL DEFAULT '0',
	`frete` decimal(10,2) NOT NULL DEFAULT '0',
	`acrescimo` decimal(10,2) NOT NULL DEFAULT '0',
	`total` decimal(10,2) NOT NULL DEFAULT '0',
	`data_criacao` timestamp NOT NULL DEFAULT (now()),
	`status` varchar(50) NOT NULL,
	`forma_pagamento` varchar(100),
	`data_entrega` timestamp,
	`garantia_inicio` timestamp,
	`observacoes` text,
	`conferido_em` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedidos_id` PRIMARY KEY(`id`),
	CONSTRAINT `pedidos_numero_unique` UNIQUE(`numero`)
);

CREATE TABLE `pedidos_carga` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`carga_id` int NOT NULL,
	`pedido_id` int NOT NULL,
	`numero_pedido` int,
	`cliente_nome` varchar(255),
	`valor_total` decimal(10,2) DEFAULT '0',
	`entregue` boolean NOT NULL DEFAULT false,
	`data_baixa` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pedidos_carga_id` PRIMARY KEY(`id`)
);

CREATE TABLE `pendencias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`pedido_id` int NOT NULL,
	`vendedor_id` int NOT NULL,
	`produto_id` int NOT NULL,
	`cor_id` int,
	`quantidade` int NOT NULL,
	`status` varchar(50) NOT NULL,
	`data_pedido` timestamp NOT NULL DEFAULT (now()),
	`data_resolvido` timestamp,
	CONSTRAINT `pendencias_id` PRIMARY KEY(`id`)
);

CREATE TABLE `plano_contas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('RECEITA','DESPESA') NOT NULL,
	`ativo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `plano_contas_id` PRIMARY KEY(`id`),
	CONSTRAINT `plano_contas_tenant_nome_idx` UNIQUE(`tenant_id`,`nome`)
);

CREATE TABLE `produtos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`descricao` text NOT NULL,
	`marca` varchar(255),
	`fornecedor` varchar(255),
	`categoria` varchar(100),
	`custo` decimal(10,2) NOT NULL DEFAULT '0',
	`desconto_fabrica` decimal(5,2) NOT NULL DEFAULT '0',
	`ipi` decimal(5,2) NOT NULL DEFAULT '0',
	`frete` decimal(10,2) NOT NULL DEFAULT '0',
	`montagem` decimal(10,2) NOT NULL DEFAULT '0',
	`lucro` decimal(10,2) NOT NULL DEFAULT '0',
	`comissao` decimal(5,2) NOT NULL DEFAULT '0',
	`juros_cartao` decimal(5,2) NOT NULL DEFAULT '0',
	`valor_venda` decimal(10,2) NOT NULL DEFAULT '0',
	`prazo_garantia` int NOT NULL DEFAULT 90,
	`grupo_id` int,
	`estoque` int NOT NULL DEFAULT 0,
	`ativo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `produtos_id` PRIMARY KEY(`id`)
);

CREATE TABLE `promocoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`inicio` timestamp NOT NULL,
	`fim` timestamp NOT NULL,
	`ativo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promocoes_id` PRIMARY KEY(`id`)
);

CREATE TABLE `promocoes_itens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`promocao_id` int NOT NULL,
	`produto_id` int NOT NULL,
	`preco_promocional` decimal(10,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promocoes_itens_id` PRIMARY KEY(`id`)
);

CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`open_id` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`login_method` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_signed_in` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_open_id_unique` UNIQUE(`open_id`)
);

CREATE TABLE `vendedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`user_id` int,
	`nome` varchar(255) NOT NULL,
	`telefone` varchar(20),
	`email` varchar(320),
	`senha` varchar(255),
	`cidade` varchar(255),
	`admin` boolean NOT NULL DEFAULT false,
	`ativo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendedores_id` PRIMARY KEY(`id`)
);

ALTER TABLE `boletos` ADD CONSTRAINT `boletos_pedido_id_pedidos_id_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `boletos` ADD CONSTRAINT `boletos_cliente_id_clientes_id_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `boletos` ADD CONSTRAINT `boletos_vendedor_id_vendedores_id_fk` FOREIGN KEY (`vendedor_id`) REFERENCES `vendedores`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `cliente_vendedores` ADD CONSTRAINT `cliente_vendedores_cliente_id_clientes_id_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `cliente_vendedores` ADD CONSTRAINT `cliente_vendedores_vendedor_id_vendedores_id_fk` FOREIGN KEY (`vendedor_id`) REFERENCES `vendedores`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `comissoes` ADD CONSTRAINT `comissoes_vendedor_id_vendedores_id_fk` FOREIGN KEY (`vendedor_id`) REFERENCES `vendedores`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `comissoes` ADD CONSTRAINT `comissoes_pedido_id_pedidos_id_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `comissoes` ADD CONSTRAINT `comissoes_carga_id_cargas_id_fk` FOREIGN KEY (`carga_id`) REFERENCES `cargas`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `contas_fixas` ADD CONSTRAINT `contas_fixas_fornecedor_id_fornecedores_id_fk` FOREIGN KEY (`fornecedor_id`) REFERENCES `fornecedores`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `contas_fixas` ADD CONSTRAINT `contas_fixas_plano_contas_id_plano_contas_id_fk` FOREIGN KEY (`plano_contas_id`) REFERENCES `plano_contas`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_conta_fixa_id_contas_fixas_id_fk` FOREIGN KEY (`conta_fixa_id`) REFERENCES `contas_fixas`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_fornecedor_id_fornecedores_id_fk` FOREIGN KEY (`fornecedor_id`) REFERENCES `fornecedores`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_plano_contas_id_plano_contas_id_fk` FOREIGN KEY (`plano_contas_id`) REFERENCES `plano_contas`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_pedido_id_pedidos_id_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_cliente_id_clientes_id_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_plano_contas_id_plano_contas_id_fk` FOREIGN KEY (`plano_contas_id`) REFERENCES `plano_contas`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `itens_pedido` ADD CONSTRAINT `itens_pedido_pedido_id_pedidos_id_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `itens_pedido` ADD CONSTRAINT `itens_pedido_produto_id_produtos_id_fk` FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `itens_pedido` ADD CONSTRAINT `itens_pedido_cor_id_cores_id_fk` FOREIGN KEY (`cor_id`) REFERENCES `cores`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_vendedor_id_vendedores_id_fk` FOREIGN KEY (`vendedor_id`) REFERENCES `vendedores`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_cliente_id_clientes_id_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `pedidos_carga` ADD CONSTRAINT `pedidos_carga_carga_id_cargas_id_fk` FOREIGN KEY (`carga_id`) REFERENCES `cargas`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `pedidos_carga` ADD CONSTRAINT `pedidos_carga_pedido_id_pedidos_id_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `pendencias` ADD CONSTRAINT `pendencias_pedido_id_pedidos_id_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `pendencias` ADD CONSTRAINT `pendencias_vendedor_id_vendedores_id_fk` FOREIGN KEY (`vendedor_id`) REFERENCES `vendedores`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `pendencias` ADD CONSTRAINT `pendencias_produto_id_produtos_id_fk` FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `pendencias` ADD CONSTRAINT `pendencias_cor_id_cores_id_fk` FOREIGN KEY (`cor_id`) REFERENCES `cores`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `produtos` ADD CONSTRAINT `produtos_grupo_id_grupos_precificacao_id_fk` FOREIGN KEY (`grupo_id`) REFERENCES `grupos_precificacao`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `promocoes_itens` ADD CONSTRAINT `promocoes_itens_promocao_id_promocoes_id_fk` FOREIGN KEY (`promocao_id`) REFERENCES `promocoes`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `promocoes_itens` ADD CONSTRAINT `promocoes_itens_produto_id_produtos_id_fk` FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `vendedores` ADD CONSTRAINT `vendedores_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
CREATE INDEX `audit_logs_tenant_id_idx` ON `audit_logs` (`tenant_id`);
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity`);
CREATE INDEX `audit_entity_id_idx` ON `audit_logs` (`entity_id`);
CREATE INDEX `audit_created_at_idx` ON `audit_logs` (`created_at`);
CREATE INDEX `audit_ip_idx` ON `audit_logs` (`ip`);
CREATE INDEX `boletos_tenant_id_idx` ON `boletos` (`tenant_id`);
CREATE INDEX `boletos_cliente_idx` ON `boletos` (`cliente_id`);
CREATE INDEX `boletos_status_idx` ON `boletos` (`status`);
CREATE INDEX `boletos_vencimento_idx` ON `boletos` (`data_vencimento`);
CREATE INDEX `caixa_mensal_tenant_id_idx` ON `caixa_mensal` (`tenant_id`);
CREATE INDEX `cargas_tenant_id_idx` ON `cargas` (`tenant_id`);
CREATE INDEX `cargas_status_idx` ON `cargas` (`status`);
CREATE INDEX `cargas_numero_idx` ON `cargas` (`numero`);
CREATE INDEX `cliente_vendedores_tenant_id_idx` ON `cliente_vendedores` (`tenant_id`);
CREATE INDEX `cliente_vendedores_cliente_idx` ON `cliente_vendedores` (`cliente_id`);
CREATE INDEX `cliente_vendedores_vendedor_idx` ON `cliente_vendedores` (`vendedor_id`);
CREATE INDEX `clientes_tenant_lookup_idx` ON `clientes` (`tenant_id`,`telefone_norm`,`nome_norm`,`sobrenome_norm`);
CREATE INDEX `clientes_nome_idx` ON `clientes` (`nome`);
CREATE INDEX `clientes_telefone_idx` ON `clientes` (`telefone`);
CREATE INDEX `comissoes_tenant_id_idx` ON `comissoes` (`tenant_id`);
CREATE INDEX `comissoes_vendedor_idx` ON `comissoes` (`vendedor_id`);
CREATE INDEX `comissoes_pedido_idx` ON `comissoes` (`pedido_id`);
CREATE INDEX `comissoes_status_idx` ON `comissoes` (`status`);
CREATE INDEX `contas_fixas_tenant_id_idx` ON `contas_fixas` (`tenant_id`);
CREATE INDEX `contas_pagar_tenant_id_idx` ON `contas_pagar` (`tenant_id`);
CREATE INDEX `contas_pagar_status_idx` ON `contas_pagar` (`status`);
CREATE INDEX `contas_pagar_vencimento_idx` ON `contas_pagar` (`data_vencimento`);
CREATE INDEX `contas_receber_tenant_id_idx` ON `contas_receber` (`tenant_id`);
CREATE INDEX `contas_receber_status_idx` ON `contas_receber` (`status`);
CREATE INDEX `contas_receber_vencimento_idx` ON `contas_receber` (`data_vencimento`);
CREATE INDEX `contas_receber_cliente_idx` ON `contas_receber` (`cliente_id`);
CREATE INDEX `counters_tenant_name_idx` ON `counters` (`tenant_id`,`name`);
CREATE INDEX `operation_key_idx` ON `financial_idempotency` (`operation_key`);
CREATE INDEX `financial_idempotency_tenant_id_idx` ON `financial_idempotency` (`tenant_id`);
CREATE INDEX `fornecedores_nome_idx` ON `fornecedores` (`nome`);
CREATE INDEX `idempotency_keys_tenant_id_idx` ON `idempotency_keys` (`tenant_id`);
CREATE INDEX `idempotency_key_idx` ON `idempotency_keys` (`key`);
CREATE INDEX `idempotency_created_at_idx` ON `idempotency_keys` (`created_at`);
CREATE INDEX `itens_pedido_tenant_id_idx` ON `itens_pedido` (`tenant_id`);
CREATE INDEX `itens_pedido_pedido_idx` ON `itens_pedido` (`pedido_id`);
CREATE INDEX `pedidos_tenant_id_idx` ON `pedidos` (`tenant_id`);
CREATE INDEX `pedidos_vendedor_idx` ON `pedidos` (`vendedor_id`);
CREATE INDEX `pedidos_cliente_idx` ON `pedidos` (`cliente_id`);
CREATE INDEX `pedidos_status_idx` ON `pedidos` (`status`);
CREATE INDEX `pedidos_numero_idx` ON `pedidos` (`numero`);
CREATE INDEX `pedidos_created_at_idx` ON `pedidos` (`created_at`);
CREATE INDEX `pedidos_carga_tenant_id_idx` ON `pedidos_carga` (`tenant_id`);
CREATE INDEX `pedidos_carga_carga_idx` ON `pedidos_carga` (`carga_id`);
CREATE INDEX `pedidos_carga_pedido_idx` ON `pedidos_carga` (`pedido_id`);
CREATE INDEX `plano_contas_tenant_id_idx` ON `plano_contas` (`tenant_id`);
CREATE INDEX `produtos_tenant_id_idx` ON `produtos` (`tenant_id`);
CREATE INDEX `produtos_descricao_idx` ON `produtos` (`descricao`);
CREATE INDEX `produtos_marca_idx` ON `produtos` (`marca`);
CREATE INDEX `produtos_ativo_idx` ON `produtos` (`ativo`);
CREATE INDEX `promocoes_tenant_id_idx` ON `promocoes` (`tenant_id`);
CREATE INDEX `promocoes_ativo_idx` ON `promocoes` (`ativo`);
CREATE INDEX `promocoes_inicio_idx` ON `promocoes` (`inicio`);
CREATE INDEX `promocoes_fim_idx` ON `promocoes` (`fim`);
CREATE INDEX `promocoes_itens_tenant_id_idx` ON `promocoes_itens` (`tenant_id`);
CREATE INDEX `promocoes_itens_promocao_idx` ON `promocoes_itens` (`promocao_id`);
CREATE INDEX `promocoes_itens_produto_idx` ON `promocoes_itens` (`produto_id`);
CREATE INDEX `users_tenant_id_idx` ON `users` (`tenant_id`);
CREATE INDEX `users_open_id_idx` ON `users` (`open_id`);
CREATE INDEX `vendedores_tenant_id_idx` ON `vendedores` (`tenant_id`);
CREATE INDEX `vendedores_user_id_idx` ON `vendedores` (`user_id`);
CREATE INDEX `vendedores_nome_idx` ON `vendedores` (`nome`);