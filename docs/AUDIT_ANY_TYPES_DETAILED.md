# AUDIT: ANY TYPES - LISTA COMPLETA

**Data:** 18/03/2026, 19:49:07
**Total ANY ocorrências:** 130

## 📊 POR SERVICE

## leo-insights.service.ts ⚠️ (17)

| Linha | Tipo | Contexto |
|------|------|----------|
| 130 | `: any` | `salesAnalytics: any,...` |
| 131 | `: any` | `stockAnalytics: any,...` |
| 132 | `: any` | `financialInsights: any,...` |
| 133 | `: any` | `previsaoCompleta: any...` |
| 139 | `: any` | `const criticos = stockAnalytics.estoqueCritico.filter((p: any) => p.status === '...` |
| 146 | `: any` | `descricao: `Produtos sem estoque disponível: ${criticos.slice(0, 3).map((p: any)...` |
| 162 | `: any` | `const valorParado = stockAnalytics.produtosSemGiro.reduce((sum: number, p: any) ...` |
| 221 | `: any` | `const produtosCrescendo = salesAnalytics.produtosMaisVendidos.filter((p: any) =>...` |
| 252 | `: any` | `salesAnalytics: any,...` |
| 253 | `: any` | `stockAnalytics: any,...` |
| 254 | `: any` | `financialInsights: any,...` |
| 255 | `: any` | `previsaoCompleta: any...` |
| 306 | `: any` | `const produtosReposicao = stockAnalytics.produtosAltoGiro.filter((p: any) => p.r...` |
| 330 | `: any` | `salesAnalytics: any,...` |
| 331 | `: any` | `stockAnalytics: any,...` |
| 332 | `: any` | `financialInsights: any,...` |
| 333 | `: any` | `previsaoCompleta: any...` |

## safe-transaction.ts ⚠️ (15)

| Linha | Tipo | Contexto |
|------|------|----------|
| 18 | `: any` | `data: any;...` |
| 27 | `: any` | `results: any[];...` |
| 34 | `: any` | `dados?: any;...` |
| 40 | `: any` | `dados: any;...` |
| 201 | `: any` | `await db.transaction(async (tx: any) => {...` |
| 239 | `: any` | `private async executeStep(tx: any, step: TransactionStep): Promise<Record<string...` |
| 258 | `: any` | `private async executePedidoStep(tx: any, step: TransactionStep): Promise<Record<...` |
| 282 | `: any` | `private async executeEstoqueStep(tx: any, step: TransactionStep): Promise<Record...` |
| 298 | `: any` | `private async executeFinanceiroStep(tx: any, step: TransactionStep): Promise<Rec...` |
| 316 | `: any` | `private async criarPedido(tx: any, pedidoOp: PedidoOperation): Promise<Record<st...` |
| 336 | `: any` | `private async atualizarPedido(tx: any, pedidoOp: PedidoOperation): Promise<Recor...` |
| 356 | `: any` | `private async cancelarPedido(tx: any, pedidoOp: PedidoOperation): Promise<Record...` |
| 378 | `: any` | `private async atualizarStatusPedido(tx: any, pedidoOp: PedidoOperation): Promise...` |
| 398 | `: any` | `private async executeContaReceberStep(tx: any, finOp: FinanceiroOperation): Prom...` |
| 438 | `: any` | `private async executeContaPagarStep(tx: any, finOp: FinanceiroOperation): Promis...` |

## leo-service.ts ⚠️ (14)

| Linha | Tipo | Contexto |
|------|------|----------|
| 97 | `: any` | `const conditions: any[] = [eq(pedidos.tenantId, tenantId)];...` |
| 162 | `: any` | `const conditions: any[] = [eq(clientes.tenantId, tenantId)];...` |
| 236 | `: any` | `const resultadoComAlertas = resultado.map((produto: any) => ({...` |
| 245 | `: any` | `estoqueBaixo: resultadoComAlertas.filter((p: any) => p.alerta.baixo).length,...` |
| 246 | `: any` | `estoqueCritico: resultadoComAlertas.filter((p: any) => p.alerta.critico).length,...` |
| 276 | `: any` | `const resultados: any = {};...` |
| 285 | `: any` | `const conditionsReceber: any[] = [eq(contasReceber.tenantId, tenantId)];...` |
| 287 | `as any` | `conditionsReceber.push(eq(contasReceber.status, filtros.status as any));...` |
| 315 | `: any` | `const conditionsPagar: any[] = [eq(contasPagar.tenantId, tenantId)];...` |
| 317 | `as any` | `conditionsPagar.push(eq(contasPagar.status, filtros.status as any));...` |
| 340 | `: any` | `totalReceber: resultados.contasReceber?.reduce((sum: number, item: any) =>...` |
| 342 | `: any` | `totalPagar: resultados.contasPagar?.reduce((sum: number, item: any) =>...` |
| 414 | `as any` | `const pedidoId = (resultPedido as any)[0]?.insertId;...` |
| 504 | `: any` | `const atualizacoes: any = {};...` |

## audit-service.ts ⚠️ (13)

| Linha | Tipo | Contexto |
|------|------|----------|
| 66 | `<any>` | `const dbConnection = await getDb() as MySql2Database<any>;...` |
| 73 | `as any` | `let query = (dbConnection as any)...` |
| 127 | `as any` | `query = (query as any).where(and(...conditions));...` |
| 131 | `as any` | `query = (query as any).orderBy(desc(auditLog.createdAt));...` |
| 134 | `as any` | `query = (query as any).limit(filtros.limit);...` |
| 138 | `as any` | `query = (query as any).offset(filtros.offset);...` |
| 144 | `as any` | `let countQuery = (dbConnection as any)...` |
| 149 | `as any` | `countQuery = (countQuery as any).where(and(...conditions));...` |
| 154 | `: any` | `return rows.map((row: any) => {...` |
| 174 | `as any` | `total: (totalResult as any)[0]?.count || 0...` |
| 191 | `<any>` | `const dbConnection = await getDb() as MySql2Database<any>;...` |
| 310 | `as any` | `await (dbConnection as any).insert?.(auditLog).values(record);...` |
| 327 | `<any>` | `const dbConnection = await getDb() as MySql2Database<any>;...` |

## inventory.service.ts ⚠️ (11)

| Linha | Tipo | Contexto |
|------|------|----------|
| 119 | `: any` | `const ids = safeItems.map((p: any) => p.id);...` |
| 125 | `: any` | `const variacoesRows: any[] = await (dbConn as any).execute(`...` |
| 125 | `as any` | `const variacoesRows: any[] = await (dbConn as any).execute(`...` |
| 139 | `as any` | `for (const r of (variacoesRows as any)?.[0] || variacoesRows || []) {...` |
| 152 | `: any` | `const promoRows: any[] = await (dbConn as any).execute(`...` |
| 152 | `as any` | `const promoRows: any[] = await (dbConn as any).execute(`...` |
| 172 | `: any` | `const result = safeItems.map((p: any) => {...` |
| 398 | `: any` | `await (dbConn as any).transaction(async (tx: any) => {...` |
| 398 | `as any` | `await (dbConn as any).transaction(async (tx: any) => {...` |
| 400 | `: any` | `const [notaRes]: any = await tx.execute(sql`...` |
| 443 | `: any` | `export async function updateGrupoPrecificacao(tenantId: number, id: number, data...` |

## cached-inventory.service.ts ⚠️ (7)

| Linha | Tipo | Contexto |
|------|------|----------|
| 145 | `: any` | `): Promise<{ items: any[]; total: number }> {...` |
| 158 | `: any` | `export async function createProduto(tenantId: number, data: any): Promise<{ id: ...` |
| 173 | `: any` | `export async function updateProduto(tenantId: number, id: number, data: any): Pr...` |
| 173 | `<any>` | `export async function updateProduto(tenantId: number, id: number, data: any): Pr...` |
| 188 | `<any>` | `export async function deleteProduto(tenantId: number, id: number): Promise<any> ...` |
| 203 | `: any` | `export async function updateEstoqueProduto(tenantId: number, data: any): Promise...` |
| 203 | `<any>` | `export async function updateEstoqueProduto(tenantId: number, data: any): Promise...` |

## cached-clientes.service.ts ⚠️ (6)

| Linha | Tipo | Contexto |
|------|------|----------|
| 50 | `: any` | `): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {...` |
| 139 | `: any` | `export async function updateCliente(tenantId: number, id: number, data: any): Pr...` |
| 139 | `<any>` | `export async function updateCliente(tenantId: number, id: number, data: any): Pr...` |
| 154 | `<any>` | `export async function deleteCliente(tenantId: number, id: number): Promise<any> ...` |
| 169 | `<any>` | `export async function associarClienteVendedor(tenantId: number, clienteId: numbe...` |
| 184 | `<any>` | `export async function removerAssociacaoClienteVendedor(tenantId: number, cliente...` |

## finance.service.ts ⚠️ (6)

| Linha | Tipo | Contexto |
|------|------|----------|
| 84 | `: any` | `return await (dbTx as any).transaction?.(async (tx: any) => {...` |
| 84 | `as any` | `return await (dbTx as any).transaction?.(async (tx: any) => {...` |
| 233 | `: any` | `return await dbTx.transaction?.(async (transaction: any) => {...` |
| 664 | `as any` | `const existing = await (dbTx as any).select?.()...` |
| 680 | `as any` | `await (dbTx as any).update?.(caixaMensal)...` |
| 692 | `as any` | `await (dbTx as any).insert?.(caixaMensal).values(newData);...` |

## logistica.service.ts ⚠️ (6)

| Linha | Tipo | Contexto |
|------|------|----------|
| 172 | `as any` | `let query = dbConn.select().from(cargas) as any;...` |
| 197 | `as any` | `const items = await (query as any).execute?.() as unknown as any[];...` |
| 218 | `: any` | `const updateData: { status: any; updatedAt: Date } = {...` |
| 219 | `as any` | `status: data.status as any,...` |
| 264 | `as any` | `} as any);...` |
| 371 | `as any` | `const updateData = { ...data, updatedAt: new Date() } as any;...` |

## safe-stock.ts ⚠️ (6)

| Linha | Tipo | Contexto |
|------|------|----------|
| 102 | `: any` | `const result = await db.transaction(async (tx: any) => {...` |
| 194 | `: any` | `private async lockProduct(tx: any, produtoId: number): Promise<Record<string, un...` |
| 245 | `: any` | `tx: any,...` |
| 344 | `: any` | `const results = await db.transaction(async (tx: any) => {...` |
| 387 | `: any` | `return operations.map((op: any) => ({...` |
| 403 | `: any` | `tx: any,...` |

## system-monitor.ts ⚠️ (6)

| Linha | Tipo | Contexto |
|------|------|----------|
| 179 | `: any` | `private errors: Array<{ timestamp: Date; error: string; context?: any }> = [];...` |
| 322 | `as any` | `totalSizeBytes: typeof (leoMemoryStats as any)?.memory?.totalSizeBytes === 'numb...` |
| 322 | `as any` | `totalSizeBytes: typeof (leoMemoryStats as any)?.memory?.totalSizeBytes === 'numb...` |
| 323 | `as any` | `maxMemoryMB: typeof (leoMemoryStats as any)?.memory?.maxMemoryMB === 'number' ? ...` |
| 323 | `as any` | `maxMemoryMB: typeof (leoMemoryStats as any)?.memory?.maxMemoryMB === 'number' ? ...` |
| 339 | `as any` | `queues: queueStats as any,...` |

## async-operations.ts ⚠️ (5)

| Linha | Tipo | Contexto |
|------|------|----------|
| 20 | `: any` | `result?: any;...` |
| 51 | `: any` | `context: any;...` |
| 52 | `: any` | `parameters?: any;...` |
| 57 | `: any` | `filters?: any;...` |
| 500 | `: any` | `result?: any,...` |

## users.service.ts ⚠️ (5)

| Linha | Tipo | Contexto |
|------|------|----------|
| 178 | `as any` | `const dbConn = await getDb() as any;...` |
| 248 | `as any` | `const dbConn = await getDb() as any;...` |
| 266 | `: any` | `let orderBy: any;...` |
| 307 | `as any` | `const dbConn = await getDb() as any;...` |
| 334 | `as any` | `const dbConn = await getDb() as any;...` |

## clientes.service.ts ⚠️ (4)

| Linha | Tipo | Contexto |
|------|------|----------|
| 564 | `: any` | `vendedor: any;...` |
| 565 | `: any` | `associacao: any;...` |
| 587 | `: any` | `vendedor: any;...` |
| 588 | `: any` | `associacao: any;...` |

## stock-safety.service.ts ⚠️ (4)

| Linha | Tipo | Contexto |
|------|------|----------|
| 69 | `as any` | `const produtoData = produto[0] as any;...` |
| 209 | `: any` | `const produtosMap = new Map((produtosRows as any[]).map((p: any) => [p.id, p] as...` |
| 274 | `: any` | `const produtosMap = new Map((produtosRows as any[]).map((p: any) => [p.id, p] as...` |
| 365 | `: any` | `const produtosMap = new Map((produtosRows as any[]).map((p: any) => [p.id, p] as...` |

## promocoes.service.ts ⚠️ (2)

| Linha | Tipo | Contexto |
|------|------|----------|
| 33 | `as any` | `query = query.limit(options.pageSize).offset(offset) as any;...` |
| 36 | `as any` | `query = query.limit(1000) as any;...` |

## system.service.ts ⚠️ (2)

| Linha | Tipo | Contexto |
|------|------|----------|
| 31 | `as any` | `for (const p of (pedidosSemItens as any)?.[0] || []) {...` |
| 50 | `as any` | `for (const p of (divergenciasTotal as any)?.[0] || []) {...` |

## orders.service.ts ⚠️ (1)

| Linha | Tipo | Contexto |
|------|------|----------|
| 149 | `: any` | `} catch (error: any) {...` |


## 📋 SUBSTITUIÇÕES RÁPIDAS

### Cheat Sheet de Tipos Seguros

```typescript
// Ao invés de: any
type Payload = Record<string, unknown>;
type SafeValue = string | number | boolean | null | undefined;
type SafeObject = { [key: string]: unknown };
```
