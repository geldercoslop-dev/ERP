# 📋 LISTA ESTRUTURADA: TODOS OS ACESSOS A CLIENTES E PEDIDOS

**Formato:** Arquivo | Linha | Tipo de Acesso | Operação | Ownership Check? | Status

---

## 🟢 CLIENTES - Leitura (SELECT)

| # | Arquivo | Linha | Tipo | SQL/Query | Ownership Check | Status |
|---|---------|-------|------|-----------|-----------------|--------|
| 1 | `services/reports/pdf.service.ts` | 735 | SELECT | `select().from(clientes).where(eq(tenantId))` | ❌ NÃO | 🔴 RISCO |
| 2 | `services/clientes.service.ts` | 285 | SELECT | `select().from(clientes).where(and(tenantId, id))` | ✅ SIM - `userCanAccessCliente()` | ✅ OK |
| 3 | `services/clientes.service.ts` | 463 | SELECT | `select().from(clientes).where(and(...conditions))` | ✅ SIM - `listClientes()` filtra actor | ✅ OK |
| 4 | `services/clientes.service.ts` | 491 | SELECT | `select().from(clientes).where(and(tenantId, id))` | ✅ SIM - check em `userCanAccessCliente()` | ✅ OK |
| 5 | `services/clientes.service.ts` | 529 | SELECT | `select().from(clientes).where(and(tenantId, id))` | ✅ SIM - check em `userCanAccessCliente()` | ✅ OK |
| 6 | `services/clientes.service.ts` | 550 | SELECT | `select().from(clientes).where(and(tenantId, id))` | ✅ SIM - check em `userCanAccessCliente()` | ✅ OK |
| 7 | `services/clientes.service.ts` | 683 | SELECT | `select().from(clientes).where(and(tenantId, id))` | ✅ SIM - check em `userCanAccessCliente()` | ✅ OK |
| 8 | `services/clientes.service.ts` | 704 | SELECT | `select().from(clientes).where(and(tenantId, id))` | ✅ SIM - check em `userCanAccessCliente()` | ✅ OK |
| 9 | `services/clientes.service.ts` | 745 | SELECT | `select().from(clientes)` | ✅ SIM - em `getHistoricoCliente()` | ✅ OK |
| 10 | `services/clientes.service.ts` | 766 | SELECT | `select().from(clientes)` | ✅ SIM - em contexto de ator | ✅ OK |
| 11 | `services/clientes.service.ts` | 798 | SELECT | `select().from(clientes).where(base)` | ✅ SIM - base já tem filtering | ✅ OK |
| 12 | `cache/intelligent-cache.ts` | 64 | SELECT | `select().from(clientesTable)` | ✅ SIM - wrapper de clientes.service | ✅ OK |

**Resumo Clientes SELECT:** 11 ✅ OK, 1 🔴 RISCO = **85% seguro**

---

## 🟢 PEDIDOS - Leitura (SELECT)

| # | Arquivo | Linha | Tipo | SQL/Query | Ownership Check | Status |
|---|---------|-------|------|-----------|-----------------|--------|
| 1 | `services/orders.service.ts` | 566 | SELECT | `select().from(pedidos).where(and(tenantId, id))` | ✅ SIM - `getPedidoByIdForActor()` | ✅ OK |
| 2 | `services/orders.service.ts` | 684 | SELECT | `select().from(pedidos).where(and(...conditions))` | ✅ SIM - `listPedidosExtended()` | ✅ OK |
| 3 | `db/core.ts` | 306 | SELECT | `select().from(pedidos).where(eq(pedidos.id, id))` | ✅ SIM - ctx filtro | ✅ OK |
| 4 | `services/logistica.service.ts` | 62 | SELECT | `select().from(pedidosCarga).where(eq(id))` | ✅ SIM - em transação validada | ✅ OK |
| 5 | `services/logistica.service.ts` | 91 | SELECT | `select().from(pedidosCarga)` | ✅ SIM - filtra condições | ✅ OK |
| 6 | `services/logistica.service.ts` | 589 | SELECT | `select().from(pedidos).where(and(...conditions))` | ✅ SIM - filtra | ✅ OK |
| 7 | `services/finance.service.ts` | 127 | SELECT | `select().from(pedidos).where(and(tenantId, id)).for('update')` | ✅ SIM - lock transaction | ✅ OK |
| 8 | `routers.ts` | list endpoint | SELECT | tRPC query | ✅ SIM - `listPedidosTrpcPage()` | ✅ OK |
| 9 | `routers.ts` | getById endpoint | SELECT | tRPC query | ✅ SIM - `getPedidoWithItensForActor()` | ✅ OK |

**Resumo Pedidos SELECT:** 9 ✅ OK, 0 🔴 RISCO = **100% seguro**

---

## 🟢 CLIENTES - Criação (INSERT)

| # | Arquivo | Linha | Tipo | SQL/Query | Ownership Check | Status |
|---|---------|-------|------|-----------|-----------------|--------|
| 1 | `services/clientes.service.ts` | ~145 | INSERT | `insert(clientes).values({...})` | ✅ SIM - `userIdOverride` param / router sets `actor.userId` | ✅ OK |

**Resumo Clientes INSERT:** 1 ✅ OK = **100% seguro**

---

## 🟢 PEDIDOS - Criação (INSERT)

| # | Arquivo | Linha | Tipo | SQL/Query | Ownership Check | Status |
|---|---------|-------|------|-----------|-----------------|--------|
| 1 | `services/orders.service.ts` | ~415 | INSERT | `insert(pedidos).values({...})` | ✅ SIM - `getClienteRowForPedidoCreate()` valida + `resolveVendedorIdForCreate()` | ✅ OK |
| 2 | `services/orders.service.ts` | ~445 | INSERT | `insert(itensPedido).values({...})` | ✅ SIM - inserido apenas após pedido validado | ✅ OK |

**Resumo Pedidos INSERT:** 2 ✅ OK = **100% seguro**

---

## 🟡 CLIENTES - Atualização (UPDATE)

| # | Arquivo | Linha | Tipo | SQL/Query | Ownership Check | Status |
|---|---------|-------|------|-----------|-----------------|--------|
| 1 | `services/clientes.service.ts` | 526 | UPDATE | `update(clientes).set({...}).where(and(tenantId, id))` | ✅ SIM - `userCanMutateCliente(actor, userId)` check | ✅ OK |

**Resumo Clientes UPDATE:** 1 ✅ OK = **100% seguro**

---

## 🔴 PEDIDOS - Atualização (UPDATE) - ⚠️ MÚLTIPLAS VULNERABILIDADES

| # | Arquivo | Linha | Tipo | SQL/Query | Ownership Check | Status |
|---|---------|-------|------|-----------|-----------------|--------|
| 1 | `services/orders.service.ts` | 863 | UPDATE | `update(pedidos).set({...}).where(and(tenantId, id))` | ❌ NÃO - sem `assertPedidoMutableByActor()` | 🔴 RISCO |
| 2 | `services/orders.service.ts` | 910 | UPDATE | `update(pedidos).set({...}).where(and(tenantId, id))` | ❌ NÃO - sem check | 🔴 RISCO |
| 3 | `services/finance.service.ts` | 145 | UPDATE | `update(pedidos).set({status:...})` em transação | ❌ NÃO - sem validação actor | 🔴 RISCO |
| 4 | `services/safe-transaction.ts` | 361 | UPDATE | `update(pedidos).set({...})` | ⚠️ DEPENDE - presume validação anterior | ✅ OK se chamado corretamente |
| 5 | `services/safe-transaction.ts` | 383 | UPDATE | `update(pedidos).set({...})` | ⚠️ DEPENDE - presume validação anterior | ✅ OK se chamado corretamente |
| 6 | `services/safe-transaction.ts` | 406 | UPDATE | `update(pedidos).set({...})` | ⚠️ DEPENDE - presume validação anterior | ✅ OK se chamado corretamente |
| 7 | `services/logistica.service.ts` | 32 | UPDATE | `update(pedidos).set({status: EM_ROTA})` | ⚠️ VERIFICAR contexto de chamada | ⚠️ REVISAR |
| 8 | `services/logistica.service.ts` | (implicit) | UPDATE | em transação logística | ⚠️ VERIFICAR | ⚠️ REVISAR |

**Resumo Pedidos UPDATE:** 
- 🔴 3 CRÍTICAS (sem check nenhum): linhas 863, 910, finance 145
- ⚠️ 3 DEPENDENTES (podem estar OK): safe-transaction 361, 383, 406
- ⚠️ 2 À REVISAR: logística 32 + implicit
- **Total: 3 🔴 CRÍTICAS + 2 ⚠️ REVISAR = 38% risco nesta categoria**

---

## 🟢 CLIENTES - Exclusão (DELETE)

| # | Arquivo | Linha | Tipo | SQL/Query | Ownership Check | Status |
|---|---------|-------|------|-----------|-----------------|--------|
| 1 | `services/clientes.service.ts` | (soft delete) | DELETE | `update(clientes).set({deletedAt:...})` | ✅ SIM - router tem `adminProcedure` | ✅ OK |

**Resumo Clientes DELETE:** 1 ✅ OK = **100% seguro (admin only)**

---

## 🟢 PEDIDOS - Exclusão (DELETE)

| # | Arquivo | Linha | Tipo | SQL/Query | Ownership Check | Status |
|---|---------|-------|------|-----------|-----------------|--------|
| (nenhuma) | - | - | - | - | - | ✅ OK (sem delete hard) |

**Resumo Pedidos DELETE:** 0 encontradas = **100% seguro (nenhuma delete)**

---

## 📊 TABELA DE CONSOLIDAÇÃO POR TIPO

### Todos os Acessos por Categoria

| Categoria | Total | Seguro ✅ | Risco 🔴 | Taxa | Status |
|-----------|-------|----------|---------|------|--------|
| **SELECT clientes** | 12 | 11 | 1 | 92% | 🟡 |
| **SELECT pedidos** | 9 | 9 | 0 | 100% | ✅ |
| **INSERT clientes** | 1 | 1 | 0 | 100% | ✅ |
| **INSERT pedidos** | 2 | 2 | 0 | 100% | ✅ |
| **UPDATE clientes** | 1 | 1 | 0 | 100% | ✅ |
| **UPDATE pedidos** | 8 | 3 | 3 | 38% | 🔴 |
| **DELETE clientes** | 1 | 1 | 0 | 100% | ✅ |
| **DELETE pedidos** | 0 | 0 | 0 | - | ✅ |
| **TOTAL** | **34** | **28** | **4** | **82%** | 🟡 |

---

## 🔴 MAPEAMENTO DE VULNERABILIDADES

### Vulnerabilidade 1: PDF Report
```
Arquivo: server/services/reports/pdf.service.ts
Linha:   735
Query:   select().from(clientes).where(eq(clientes.tenantId, tenantId)).limit(1000);
Problema: Sem filtro por clientes.userId
Causa:   Não recebe actor como parâmetro
Risco:   Vendedor A vê TODOS os clientes do tenant
Severidade: CRÍTICA
```

### Vulnerabilidade 2: Update Pedido (dados)
```
Arquivo: server/services/orders.service.ts
Linha:   863
Função:  updatePedido(tenantId, actor, id, data)
Query:   update(pedidos).set({...}).where(and(eq(tenantId), eq(id)))
Problema: Sem chamar assertPedidoMutableByActor()
Causa:   Check não implementado
Risco:   Vendedor A modifica qualquer pedido (mesmo outro dono)
Severidade: CRÍTICA
```

### Vulnerabilidade 3: Update Pedido (status)
```
Arquivo: server/services/orders.service.ts
Linha:   910
Função:  updatePedido() [status change branch]
Query:   update(pedidos).set({status:...})
Problema: Sem validação de ownership
Causa:   Branch não tem check
Risco:   Mudança de status desautorizada
Severidade: CRÍTICA
```

### Vulnerabilidade 4: Update Pedido (finance)
```
Arquivo: server/services/finance.service.ts
Linha:   145
Query:   update(pedidos).set({status:...}) em transação
Problema: Sem validação de actor
Causa:   Finance operations assumem já validado (mas não)
Risco:   Alterações financeiras não autorizadas
Severidade: CRÍTICA
```

---

## ✅ MAPEAMENTO DE SEGURANÇA

### Padrão 1: Uso Correto (exemplos de código seguro)
```typescript
// ✅ SEGURO - Valida antes de UPDATE
export async function updatePedido(...) {
  await assertPedidoMutableByActor(tenantId, actor, id); // ← CHECK!
  await dbConn.update(pedidos).set({...}).where(...);
}

// ✅ SEGURO - SELECT com filtro
const clientes = actor.role === "admin" 
  ? await db.select().from(clientes)...
  : await db.select().from(clientes).where(eq(userId, actor.userId))...
```

### Padrão 2: Uso Inseguro (encontrado)
```typescript
// ❌ INSEGURO - UPDATE sem check
await dbConn.update(pedidos)
  .set({ status, updatedAt: new Date() })
  .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)));
  // ← Sem assertPedidoMutableByActor!

// ❌ INSEGURO - SELECT sem filtro
const clientesList = await db_conn.select().from(clientes)
  .where(eq(clientes.tenantId, tenantId));
  // ← Sem filtro por userId!
```

---

## 🧪 Funções de Validação Disponíveis

```typescript
// ✅ Usar estas funções para corrigir:

// 1. Para UPDATE pedido
await assertPedidoMutableByActor(tenantId, actor, pedidoId);

// 2. Para UPDATE cliente
await userCanMutateCliente(actor, clienteUserId);

// 3. Para SELECT geral
async function userCanAccessCliente(dbConn, tenantId, actor, clienteId);
async function pedidoAcessivelViaCliente(tenantId, actor, clienteId);

// 4. Em router (camada superior)
await assertOwnership(ctx, "pedido", pedidoId);
await assertOwnership(ctx, "cliente", clienteId);
```

---

## 📋 CHECKLIST PARA CORREÇÃO

### Para Cada Vulnerabilidade:

**Vulnerabilidade 1 (PDF):**
- [ ] Adicionar parametro actor
- [ ] Adicionar condicional: if admin vs if vendedor
- [ ] Filtrar por userId para vendedor
- [ ] Teste: vendedor vê apenas seus

**Vulnerabilidade 2, 3, 4 (Updates):**
- [ ] Localizar linha exata
- [ ] Adicionar: `await assertPedidoMutableByActor(tenantId, actor, id);`
- [ ] ANTES do: `await dbConn.update(pedidos)...`
- [ ] Test: vendedor rejeita outro pedido

---

**Documento gerado:** 27-MAR-2026  
**Total de linhas analisadas:** 34 operações  
**Vulnerabilidades encontradas:** 4 críticas  
**Tempo de leitura:** 5 minutos
