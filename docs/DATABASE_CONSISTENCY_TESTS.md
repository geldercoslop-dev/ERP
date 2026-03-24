# 🧪 Testes Reais de Consistência do Banco

**OBJETIVO**:  Validar que o banco de dados REALMENTE mantém integridade sob condições adversas

**ESCOPO**: Transações MySQL, stock concorrente, idempotência, integridade referencial

---

## 📋 Testes Implementados

### ✅ TESTE 1: Erro No Meio Da Transação (ROLLBACK)

**Cenário Simulado**:
```
1. BEGIN TRANSACTION
2. INSERT pedido (número 99999) ✅
3. UPDATE produtos estoque -= 5 ✅
4. INSERT contasReceber ❌ FORÇAR ERRO
5. ROLLBACK/COMMIT?
```

**Validação**:
- Estado ANTES: `{pedidos: N, estoque: EN}`
- Estado DEPOIS: `{pedidos: N, estoque: EN}` ← **Deve SER IDÊNTICO**
- Se estoque mudou → ❌ Rollback falhou!
- Se pedido foi criado → ❌ Transação incompleta!

**O Que Testa**:
- ✅ ROLLBACK funciona realmente
- ✅ Nenhuma mudança parcial fica em pé
- ✅ Isolamento de transação

---

### ✅ TESTE 2: Concorrência No Estoque (Race Condition)

**Cenário Simulado**:
```
Produto X: estoque = 10 unidades

Ordem 1: Comprar 7 unidades → deve SUCEDER
Ordem 2: Comprar 7 unidades → deve FALHAR (não há 7 mais)

Ambas executadas SIMULTANEAMENTE (Promise.all)
```

**Validação**:
- Estoque final deve ser: `10 - 7 = 3` ✅
- Estoque NUNCA pode ser negativo ✅
- Se estoque < 0 → ❌ Race condition não tratada!
- Se ambas sucedem → ❌ Locking não funciona!

**O Que Testa**:
- ✅ Pessimistic locking (SELECT ... FOR UPDATE)
- ✅ Atomicidade de operações
- ✅ Sem race conditions

---

### ✅ TESTE 3: Duplicação (Idempotência)

**Cenário Simulado**:
```
Enviar MESMO pedido (com chave de idempotência) 10x em paralelo:

Promise.all([
  createOrder(key), // 1ª
  createOrder(key), // 2ª
  createOrder(key), // 3ª
  ...
  createOrder(key)  // 10ª
])
```

**Validação**:
- Pedidos ANTES: `N`
- Pedidos DEPOIS: `N + 1` ← **Apenas UM criado!**
- Se criou 10 pedidos → ❌ Idempotência não funciona!
- Se 1 sucedeu + 9 falharam (com erro esperado) → ✅ OK

**O Que Testa**:
- ✅ Idempotência de operações
- ✅ Deduplicação de requisições
- ✅ Sem duplicatas no banco

---

### ✅ TESTE 4: Integridade De Dados (Relacionamentos)

**Validações**:

#### 4.1. Nenhum Pedido Órfão
```sql
SELECT p.* FROM pedidos p
LEFT JOIN itensPedido i ON p.id = i.pedidoId
WHERE i.id IS NULL
```
- Se há pedidos sem itens → ❌ Inconsistência!

#### 4.2. Itens Referenciando Produtos Válidos
```sql
SELECT i.* FROM itensPedido i
WHERE i.produtoId NOT IN (SELECT id FROM produtos)
```
- Se há itens órfãos → ❌ Referência inválida!

#### 4.3. Contas Receber Vs Pedidos
```sql
SELECT cr.* FROM contasReceber cr
LEFT JOIN pedidos p ON cr.pedidoNumero = p.numero
WHERE p.id IS NULL
```
- Se há contas sem pedido → ❌ Inconsistência!

#### 4.4. Totais Descasados
```sql
SELECT p.id, p.total, SUM(i.valorUnitario)
FROM pedidos p
LEFT JOIN itensPedido i ON p.id = i.pedidoId
GROUP BY p.id
HAVING ABS(p.total - SUM(i.valorUnitario)) > 0.01
```
- Se total ≠ sum(itens) → ❌ Matemática errada!

---

## 🚀 Como Executar

### Windows
```bash
.\run-database-tests.bat
```

### Linux / macOS
```bash
bash run-database-tests.sh
```

### Via npm
```bash
npm run test:consistency
```
(Requer script adicionado em package.json)

---

## 📊 Formato De Saída

```
═══════════════════════════════════════════════════════════════
📊 RESULTADOS DOS TESTES DE CONSISTÊNCIA DO BANCO
═══════════════════════════════════════════════════════════════

✅ [1] ERROR_IN_MIDDLE_TRANSACTION
   Status: PASSOU
   Detalhes: { stepsExecuted: [...], rollbackCompleto: true, ... }

❌ [2] CONCURRENT_STOCK_ORDERS
   Status: FALHOU
   Detalhes: { error: "race condition detected", ... }

✅ [3] IDEMPOTENCY_SAME_PEDIDO_10X
   Status: PASSOU
   Detalhes: { newPedidosCreated: 1, successfulCreates: 1, ... }

✅ [4] DATA_INTEGRITY
   Status: PASSOU
   Detalhes: { issues: [], checksPerformed: 4, ... }

═══════════════════════════════════════════════════════════════
📈 RESUMO: 3/4 testes passaram
═══════════════════════════════════════════════════════════════
```

---

## 🔍 Análise De Falhas

Se um teste **FALHAR**, o que significa?

### ❌ testErrorInMiddleOfTransaction FALHOU
→ **Transações NÃO estão funcionando**
→ Rollback não está revertendo mudanças
→ **Risco**: Dados inconsistentes após erro

### ❌ testConcurrentStockOrders FALHOU
→ **Race condition nos atualizações de estoque**
→ Múltiplos pedidos podem sobregravar o estoque
→ **Risco**: Estoque negativo, oversell

### ❌ testIdempotencySamePedidoMultipleTimes FALHOU
→ **Duplicação não é prevenida**
→ Sistema criou múltiplos pedidos para mesma requisição
→ **Risco**: Clientes cobrados 10x, estoque errado

### ❌ testDataIntegrity FALHOU
→ **Referências inválidas ou totais descasados**
→ Banco inconsistente (dados órfãos ou corrompidos)
→ **Risco**: Relatórios errados, conciliação impossível

---

## 📈 Pontos Frágeis Esperados

Baseado na análise de código, os seguintes cenários podem FALHAR:

1. **Safe Transaction Sem Locking Real**
   - Se `SELECT ... FOR UPDATE` não for usado → race condition

2. **Idempotency Key Sem Índice**
   - Se idempotency_keys não tiver índice UNIQUE → duplicação

3. **Cascata De Transações**
   - Se múltiplos await não são awaited corretamente → race condition

4. **AsyncLocalStorage Não Propagada**
   - Se contexto não flui através de middleware → context leak entre requisições

5. **Totais Calculados Em Aplicação**
   - Se não usa SUM() no banco → rounding errors

---

## 📝 Checklist Pós-Teste

- [ ] Todos os 4 testes passaram?
- [ ] Nenhum teste demorou > 5s?
- [ ] Banco está limpo após testes (dados de teste removidos)?
- [ ] Logs não mostram warnings de conexão?
- [ ] Relatório importado para análise?

---

## 🔗 Recursos Relacionados

- [ANY_REALITY_REPORT.md](../ANY_REALITY_REPORT.md) - 443 ANY types encontrados
- [ANY_ELIMINATION_STATUS.md](../ANY_ELIMINATION_STATUS.md) - Progresso de eliminação
- [server/infra/tracing.ts](../server/infra/tracing.ts) - AsyncLocalStorage memory leak fix
- [server/infra/safe-transaction.ts](../server/infra/safe-transaction.ts) - Transaction wrapper

---

## 📞 Troubleshooting

**Erro: "Database não disponível"**
```bash
# Verificar MySQL rodando
mysql -u root -p
# Ou
npm run test:db
```

**Erro: "Permission denied"**
```bash
# Linux/macOS: Dar permissão
chmod +x run-database-tests.sh

# Windows: Rodá como Admin
```

**Erro: "ts-node/register not found"**
```bash
npm install -D ts-node typescript
```

**Testes Hanging**
```bash
# Aumentar timeout
TIMEOUT=30000 node run-database-tests.bat
```

---

**Last Updated**: 2024
**Status**: Ready for execution
**Maintainer**: Database Engineering
