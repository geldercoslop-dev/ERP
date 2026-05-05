ALTER TABLE `pendencias` ADD `sku_id` int;--> statement-breakpoint
ALTER TABLE `pendencias` ADD CONSTRAINT `pendencias_sku_id_produto_skus_id_fk` FOREIGN KEY (`sku_id`) REFERENCES `produto_skus`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pendencias_sku_id_idx` ON `pendencias` (`sku_id`);
