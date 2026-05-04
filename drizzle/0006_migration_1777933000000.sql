ALTER TABLE `itens_pedido` ADD `sku_id` int;--> statement-breakpoint
ALTER TABLE `itens_pedido` ADD CONSTRAINT `itens_pedido_sku_id_produto_skus_id_fk` FOREIGN KEY (`sku_id`) REFERENCES `produto_skus`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `itens_pedido_sku_id_idx` ON `itens_pedido` (`sku_id`);