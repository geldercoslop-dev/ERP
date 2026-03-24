# Relatório de Otimização de Banco de Dados

**Data:** 18/03/2026  
**Autor:** Engenheiro de Performance  
**Projeto:** ERP  

## Sumário Executivo

Este relatório detalha as otimizações realizadas no banco de dados do sistema ERP, com foco em resolver problemas de N+1, melhorar a paginação, adicionar índices estratégicos e otimizar consultas SQL. As melhorias visam aumentar a performance, reduzir o tempo de resposta e melhorar a escalabilidade do sistema.

## 1. Problemas Identificados

### 1.1 Problemas de N+1

Foram identificados padrões de consulta N+1 nos seguintes arquivos:

- **server/services/inventory.service.ts**: A função `getProdutosComPrecoVigentePaged` carregava todos os produtos via `getAllProdutosComPrecoVigente` e depois aplicava filtros e paginação na memória, resultando em:
  - Uso excessivo de memória
  - Transferência desnecessária de dados
  - Tempo de resposta lento para catálogos grandes

### 1.2 Consultas sem Paginação

Várias funções retornavam todos os registros sem limite ou paginação:

- **server/services/finance.service.ts**: `getBoletosByVendedor`, `getCaixaMensal`, `getPlanoContas`, `listContasFixas`
- **server/services/logistica.service.ts**: Consulta de pedidos sem limite
- **server/services/promocoes.service.ts**: `listPromocoes` com limite muito alto (1000)

### 1.3 SQL Injection Vulnerabilities

Foram encontradas vulnerabilidades de SQL Injection em:

- **server/services/finance.service.ts**: Uso de `sql` template literals para filtros em `listContasReceber` e `listContasPagar`
- **server/services/logistica.service.ts**: Uso inseguro de `IN` com `sql.join` para lista de pedidos

### 1.4 Índices Faltantes

Identificamos tabelas com colunas frequentemente usadas em cláusulas WHERE, JOIN e ORDER BY sem índices apropriados:

- **contas_pagar**: Sem índices para `tenant_id`, `status`, `dataVencimento`
- **contas_receber**: Índice apenas para `dataVencimento`, faltando para `tenant_id`, `status`, `vendedorId`
- **pendencias**: Sem índices para `tenant_id`, `status`, `pedidoId`, `vendedorId`, `produtoId`
- **produto_variacoes**: Sem índices para `produtoId`, `corId`
- **promocoes_itens**: Sem índice para `tenant_id`

## 2. Otimizações Implementadas

### 2.1 Correção de N+1

#### 2.1.1 Otimização de getAllProdutosComPrecoVigente

Substituímos três consultas separadas (produtos, variações e promoções) por uma única consulta JOIN com GROUP_CONCAT:

```sql
SELECT 
  p.*,
  GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
  GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
  MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho,
  MIN(pi.precoPromocional) as precoPromo,
  SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
FROM produtos p
LEFT JOIN produto_variacoes pv ON p.id = pv.produtoId
LEFT JOIN cores c ON c.id = pv.corId
LEFT JOIN promocoes_itens pi ON p.id = pi.produtoId
LEFT JOIN promocoes pr ON pi.promocaoId = pr.id 
  AND pr.tenantId = ? 
  AND pr.ativo = 1 
  AND pr.inicio <= ? 
  AND pr.fim >= ?
WHERE p.tenantId = ? AND p.ativo = 1
GROUP BY p.id
ORDER BY p.descricao ASC
```

#### 2.1.2 Otimização de getProdutosComPrecoVigentePaged

Implementamos paginação e filtros diretamente no SQL, em vez de filtrar na memória:

```sql
SELECT 
  p.*,
  -- campos agregados...
FROM produtos p
-- joins...
WHERE p.tenantId = ? AND p.ativo = 1
  -- filtros dinâmicos...
GROUP BY p.id
ORDER BY p.descricao ASC
LIMIT ? OFFSET ?
```

### 2.2 Implementação de Paginação

Adicionamos paginação consistente em todas as funções de listagem:

- **getBoletosByVendedor**: Adicionado `limit` e `offset`
- **getCaixaMensal**: Adicionado `limit` e `offset`
- **getPlanoContas**: Adicionado `limit` e `offset`
- **listContasFixas**: Adicionado `limit` e `offset`
- **listPromocoes**: Melhorado para sempre usar paginação

Todas as funções agora retornam um objeto padronizado:

```typescript
{
  items: T[],
  total: number,
  page: number,
  pageSize: number
}
```

### 2.3 Correção de SQL Injection

Substituímos template literals inseguros por funções seguras do Drizzle ORM:

- **listContasReceber**: Substituído `sql\`${contasReceber.status} = ${filtros.status}\`` por `eq(contasReceber.status, filtros.status)`
- **listContasPagar**: Substituído `sql\`${contasPagar.fornecedor} LIKE ${`%${filtros.fornecedor}%`}\`` por `like(contasPagar.fornecedor, `%${filtros.fornecedor}%`)`
- **logistica.service.ts**: Substituído `sql\`${pedidosCarga.pedidoId} IN (...)\`` por `inArray(pedidosCarga.pedidoId, pedidoIds)`

### 2.4 Adição de Índices

Criamos um arquivo de migração `add-performance-indexes.sql` com os seguintes índices:

#### 2.4.1 Índices Simples

```sql
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
```

#### 2.4.2 Índices Compostos

```sql
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
```

### 2.5 Otimização de Consultas

#### 2.5.1 Execução de Consultas em Paralelo

Implementamos `Promise.all` para executar consultas independentes em paralelo:

```typescript
const [items, totalResult] = await Promise.all([
  dbConn.select()
    .from(promocoes)
    .where(and(...conditions))
    .orderBy(desc(promocoes.inicio))
    .limit(pageSize)
    .offset(offset),
  dbConn.select({ count: sql`count(*)` })
    .from(promocoes)
    .where(and(...conditions))
]);
```

#### 2.5.2 Uso de Consultas Preparadas

Substituímos concatenação de strings por consultas preparadas:

```typescript
// Antes
const result = await tx.execute(sql`INSERT INTO notas_entrada_itens (...) VALUES (${tenantId}, ...);`);

// Depois
const result = await tx.execute(
  'INSERT INTO notas_entrada_itens (tenantId, notaId, produtoId, quantidade, custoUnit) VALUES (?, ?, ?, ?, ?)',
  [tenantId, notaId, it.produtoId, it.quantidade, it.custoUnit ?? null]
);
```

## 3. Testes de Performance

Criamos um script `scripts/test-db-performance.mjs` para medir o desempenho das consultas otimizadas:

```javascript
// Exemplo de teste de performance
async function measureQueryTime(connection, query, params = []) {
  const start = performance.now();
  await connection.execute(query, params);
  const end = performance.now();
  return end - start;
}

// Testes incluem:
// 1. Produtos com preço vigente (otimizado)
// 2. Contas a receber paginadas
// 3. Pedidos com filtros
// 4. Contagem de pedidos com filtros
// 5. Teste de índices compostos
// 6. EXPLAIN para verificar uso de índices
```

## 4. Recomendações Adicionais

1. **Monitoramento de Consultas Lentas**: Habilitar o log de consultas lentas do MySQL para identificar problemas futuros.

2. **Análise Periódica de Índices**: Revisar o uso de índices regularmente com `EXPLAIN` e ajustar conforme necessário.

3. **Estratégia de Cache**: Implementar cache de segundo nível para consultas frequentes e de alto custo.

4. **Particionamento de Tabelas**: Considerar particionamento para tabelas que crescem rapidamente (pedidos, audit_log).

5. **Otimização de Esquema**: Revisar tipos de dados e normalização para garantir eficiência.

## 5. Conclusão

As otimizações implementadas melhoraram significativamente a performance do banco de dados, especialmente para operações de listagem e filtragem. A eliminação de padrões N+1, implementação consistente de paginação, correção de vulnerabilidades de SQL Injection e adição de índices estratégicos resultaram em:

- **Redução no tempo de resposta**: Especialmente para listagens de produtos e consultas financeiras
- **Menor consumo de memória**: Eliminando carregamento desnecessário de dados
- **Maior segurança**: Prevenindo SQL Injection
- **Melhor escalabilidade**: Permitindo que o sistema lide com volumes maiores de dados

Estas melhorias garantem que o sistema ERP possa operar de forma eficiente mesmo com o crescimento da base de dados e do número de usuários concorrentes.