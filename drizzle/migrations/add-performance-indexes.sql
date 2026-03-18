-- Migração para adicionar índices de performance faltantes
-- Criado em: 2026-03-18

-- Índices para tabela contasPagar
ALTER TABLE contas_pagar ADD INDEX idx_contas_pagar_tenant_id (tenant_id);
ALTER TABLE contas_pagar ADD INDEX idx_contas_pagar_status (status);
ALTER TABLE contas_pagar ADD INDEX idx_contas_pagar_fornecedor (fornecedor(50));
ALTER TABLE contas_pagar ADD INDEX idx_contas_pagar_data_vencimento (dataVencimento);
ALTER TABLE contas_pagar ADD INDEX idx_contas_pagar_plano_contas (planoContasId);

-- Índices para tabela contasReceber
ALTER TABLE contas_receber ADD INDEX idx_contas_receber_tenant_id (tenant_id);
ALTER TABLE contas_receber ADD INDEX idx_contas_receber_status (status);
ALTER TABLE contas_receber ADD INDEX idx_contas_receber_vendedor_id (vendedorId);
ALTER TABLE contas_receber ADD INDEX idx_contas_receber_pedido_numero (pedidoNumero);

-- Índices para tabela pendencias
ALTER TABLE pendencias ADD INDEX idx_pendencias_tenant_id (tenant_id);
ALTER TABLE pendencias ADD INDEX idx_pendencias_status (status);
ALTER TABLE pendencias ADD INDEX idx_pendencias_pedido_id (pedidoId);
ALTER TABLE pendencias ADD INDEX idx_pendencias_vendedor_id (vendedorId);
ALTER TABLE pendencias ADD INDEX idx_pendencias_produto_id (produtoId);
ALTER TABLE pendencias ADD INDEX idx_pendencias_data_pedido (dataPedido);

-- Índices para tabela produto_variacoes
ALTER TABLE produto_variacoes ADD INDEX idx_produto_variacoes_produto_id (produtoId);
ALTER TABLE produto_variacoes ADD INDEX idx_produto_variacoes_cor_id (corId);

-- Índices para tabela promocoes_itens
ALTER TABLE promocoes_itens ADD INDEX idx_promocoes_itens_tenant_id (tenant_id);

-- Índices para tabela auditLog
ALTER TABLE audit_log ADD INDEX idx_audit_log_tenant_id (tenant_id);
ALTER TABLE audit_log ADD INDEX idx_audit_log_action_entity (action, entity);
ALTER TABLE audit_log ADD INDEX idx_audit_log_actor_user_id (actorUserId);
ALTER TABLE audit_log ADD INDEX idx_audit_log_actor_vendedor_id (actorVendedorId);

-- Índices compostos para melhorar consultas frequentes
ALTER TABLE produtos ADD INDEX idx_produtos_tenant_ativo_categoria (tenant_id, ativo, categoria(50));
ALTER TABLE produtos ADD INDEX idx_produtos_tenant_ativo_marca (tenant_id, ativo, marca(50));
ALTER TABLE produtos ADD INDEX idx_produtos_tenant_ativo_estoque (tenant_id, ativo, estoque);

-- Índices para melhorar consultas de data
ALTER TABLE pedidos ADD INDEX idx_pedidos_tenant_status_created (tenant_id, status, createdAt);
ALTER TABLE pedidos ADD INDEX idx_pedidos_tenant_cliente_created (tenant_id, clienteId, createdAt);
ALTER TABLE pedidos ADD INDEX idx_pedidos_tenant_vendedor_created (tenant_id, vendedorId, createdAt);

-- Índices para melhorar buscas por texto
ALTER TABLE pedidos ADD FULLTEXT INDEX ft_idx_pedidos_cliente_nome (clienteNome);
ALTER TABLE produtos ADD FULLTEXT INDEX ft_idx_produtos_descricao (descricao(500));
ALTER TABLE clientes ADD FULLTEXT INDEX ft_idx_clientes_nome (nome);