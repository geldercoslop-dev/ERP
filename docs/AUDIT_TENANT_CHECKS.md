# AUDIT: TENANT CHECK VALIDATION

**Data:** 18/03/2026, 19:48:38

## 📊 RESUMO

| Métrica | Valor |
|--------|-------|
| Services com tenantId | 16 |
| Funções com tenantId | 126 |
| SEM validação tenantId | 57 ⛔ |

## 🔴 CRÍTICOS (Com tenantId mas SEM validação)

### ❌ finance.service.ts
**Funções SEM tenant check:**
- `baixarBoletoParcial` (linha 220)
- `marcarContaRecebida` (linha 280)
- `deleteContaReceber` (linha 313)
- `getCaixaMensal` (linha 339)
- `getAllCaixaMensal` (linha 348)
- `getPlanoContas` (linha 354)
- `createPlanoContas` (linha 363)
- `pagarConta` (linha 382)
- `deleteContaPagar` (linha 398)
- `listContasFixas` (linha 409)
- `createContaFixa` (linha 415)
- `gerarContasFixasMes` (linha 428)
- `marcarComissaoPaga` (linha 472)
- `atualizarCaixaMensal` (linha 651)

### ❌ inventory.service.ts
**Funções SEM tenant check:**
- `listCores` (linha 20)
- `createCor` (linha 28)
- `updateCor` (linha 36)
- `deleteCor` (linha 43)
- `getProdutosComPrecoVigentePaged` (linha 198)
- `updateEstoqueProduto` (linha 229)
- `updateGrupoPrecificacao` (linha 443)
- `deleteGrupoPrecificacao` (linha 452)

### ❌ cached-clientes.service.ts
**Funções SEM tenant check:**
- `listClientes` (linha 47)
- `createCliente` (linha 124)
- `updateCliente` (linha 139)
- `deleteCliente` (linha 154)
- `associarClienteVendedor` (linha 169)
- `removerAssociacaoClienteVendedor` (linha 184)

### ❌ cached-inventory.service.ts
**Funções SEM tenant check:**
- `getProdutosComPrecoVigentePaged` (linha 108)
- `getProdutosEstoqueBaixo` (linha 142)
- `createProduto` (linha 158)
- `updateProduto` (linha 173)
- `deleteProduto` (linha 188)
- `updateEstoqueProduto` (linha 203)

### ❌ orders.service.ts
**Funções SEM tenant check:**
- `getItensPedido` (linha 385)
- `listPedidosExtended` (linha 406)
- `updatePedido` (linha 443)
- `deletePedido` (linha 461)
- `getReportVendasPeriodo` (linha 560)
- `getReportProdutosMaisVendidos` (linha 617)

### ❌ clientes.service.ts
**Funções SEM tenant check:**
- `getHistoricoCliente` (linha 162)
- `associarClienteVendedor` (linha 355)
- `deleteCliente` (linha 488)
- `removerAssociacaoClienteVendedor` (linha 544)
- `getReportClientesAtivos` (linha 629)

### ❌ users.service.ts
**Funções SEM tenant check:**
- `listUsers` (linha 100)
- `listVendedores` (linha 237)
- `toggleVendedor` (linha 306)
- `removeVendedor` (linha 333)

### ❌ logistica.service.ts
**Funções SEM tenant check:**
- `insertHistoricoRota` (linha 432)
- `listHistoricoRotas` (linha 441)

### ❌ stock-safety.service.ts
**Funções SEM tenant check:**
- `validateStockAvailability` (linha 141)
- `getStockMovements` (linha 427)

### ❌ audit-service.ts
**Funções SEM tenant check:**
- `verificarConsistenciaDados` (linha 323)

### ❌ dashboard-insights.service.ts
**Funções SEM tenant check:**
- `getDashboardInsights` (linha 58)

### ❌ leo-insights.service.ts
**Funções SEM tenant check:**
- `getLeoInsights` (linha 76)

### ❌ reports.service.ts
**Funções SEM tenant check:**
- `getVendasPeriodo` (linha 10)


## ✅ OK (Validação presente)

✓ pendencias.service.ts - 4 funções com validação
✓ promocoes.service.ts - 11 funções com validação
✓ system.service.ts - 1 funções com validação
