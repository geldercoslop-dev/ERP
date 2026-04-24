-- =============================================================================
-- Script: Remover FKs que apontam para tenants antes de DROP TABLE tenants
-- Uso: Execute este script no MySQL (phpMyAdmin, MySQL Workbench ou linha de comando)
--      DEPOIS rode: pnpm exec drizzle-kit push
--
-- Erro que este script evita:
--   ER_ROW_IS_REFERENCED_2 (#1451) - Cannot delete or update a parent row
-- =============================================================================

-- Desabilitar checagem de FKs só para esta sessão (opcional, facilita se alguma tabela não existir)
SET FOREIGN_KEY_CHECKS = 0;

-- 1) Remover todas as foreign keys que referenciam tenants.id
--    (Execute cada ALTER; se a tabela ou FK não existir, o erro pode ser ignorado numa segunda rodada)

ALTER TABLE `audit_log`           DROP FOREIGN KEY `audit_log_tenantId_tenants_id_fk`;
ALTER TABLE `boletos`            DROP FOREIGN KEY `boletos_tenantId_tenants_id_fk`;
ALTER TABLE `caixa_mensal`       DROP FOREIGN KEY `caixa_mensal_tenantId_tenants_id_fk`;
ALTER TABLE `cargas`            DROP FOREIGN KEY `cargas_tenantId_tenants_id_fk`;
ALTER TABLE `clientes`          DROP FOREIGN KEY `clientes_tenantId_tenants_id_fk`;
ALTER TABLE `comissoes`         DROP FOREIGN KEY `comissoes_tenantId_tenants_id_fk`;
ALTER TABLE `configuracoes`     DROP FOREIGN KEY `configuracoes_tenantId_tenants_id_fk`;
ALTER TABLE `contas_fixas`      DROP FOREIGN KEY `contas_fixas_tenantId_tenants_id_fk`;
ALTER TABLE `contas_pagar`      DROP FOREIGN KEY `contas_pagar_tenantId_tenants_id_fk`;
ALTER TABLE `contas_receber`    DROP FOREIGN KEY `contas_receber_tenantId_tenants_id_fk`;
ALTER TABLE `cores`             DROP FOREIGN KEY `cores_tenantId_tenants_id_fk`;
ALTER TABLE `counters`          DROP FOREIGN KEY `counters_tenantId_tenants_id_fk`;
ALTER TABLE `grupos_precificacao` DROP FOREIGN KEY `grupos_precificacao_tenantId_tenants_id_fk`;
ALTER TABLE `itens_pedido`      DROP FOREIGN KEY `itens_pedido_tenantId_tenants_id_fk`;
ALTER TABLE `pagamentos_boleto` DROP FOREIGN KEY `pagamentos_boleto_tenantId_tenants_id_fk`;
ALTER TABLE `pedidos`           DROP FOREIGN KEY `pedidos_tenantId_tenants_id_fk`;
ALTER TABLE `pendencias`        DROP FOREIGN KEY `pendencias_tenantId_tenants_id_fk`;
ALTER TABLE `plano_contas`      DROP FOREIGN KEY `plano_contas_tenantId_tenants_id_fk`;
ALTER TABLE `produtos`          DROP FOREIGN KEY `produtos_tenantId_tenants_id_fk`;
ALTER TABLE `promocoes`         DROP FOREIGN KEY `promocoes_tenantId_tenants_id_fk`;
ALTER TABLE `promocoes_itens`   DROP FOREIGN KEY `promocoes_itens_tenantId_tenants_id_fk`;
ALTER TABLE `users`             DROP FOREIGN KEY `users_tenantId_tenants_id_fk`;
ALTER TABLE `vendedores`        DROP FOREIGN KEY `vendedores_tenantId_tenants_id_fk`;

-- Tabelas que podem ter sido dropadas em migrações anteriores (ignore erro se não existir):
-- ALTER TABLE `job_execution_log`   DROP FOREIGN KEY `job_execution_log_tenantId_tenants_id_fk`;
-- ALTER TABLE `leo_actions_log`     DROP FOREIGN KEY `leo_actions_log_tenantId_tenants_id_fk`;
-- ALTER TABLE `leo_activity_log`    DROP FOREIGN KEY `leo_activity_log_tenantId_tenants_id_fk`;
-- ALTER TABLE `leo_learning_log`    DROP FOREIGN KEY `leo_learning_log_tenantId_tenants_id_fk`;
-- ALTER TABLE `leo_memory`          DROP FOREIGN KEY `leo_memory_tenantId_tenants_id_fk`;
-- ALTER TABLE `leo_vector_memory`   DROP FOREIGN KEY `leo_vector_memory_tenantId_tenants_id_fk`;

-- 2) Agora pode apagar a tabela tenants
DROP TABLE IF EXISTS `tenants`;

SET FOREIGN_KEY_CHECKS = 1;

-- Próximo passo: no terminal do projeto, rode:
--   pnpm exec drizzle-kit push
