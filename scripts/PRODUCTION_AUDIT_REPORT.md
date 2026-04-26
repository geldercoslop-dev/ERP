# PRODUCTION AUDIT REPORT

**Generated:** 2026-04-26T01:23:51.066Z

**FINAL SCORE:** CRITICAL - BLOCKS PRODUCTION

**Summary:** System has 125 CRITICAL issues that must be fixed before production deployment. These include tenant leaks, missing tenantId columns, and security bypasses.

## Issue Summary

| Severity | Count |
|----------|-------|
| Critical | 125 |
| High | 14 |
| Medium | 15 |
| Low | 1 |

## Phase 1: COMPLETED

### Critical Issues
- Table pendencias missing in database
- Table cliente_vendedores missing in database
- Table idempotency_keys missing in database
- Table boletos missing in database
- Table caixa_mensal missing in database
- Table promocoes missing in database
- Table promocoes_itens missing in database
- Table cargas missing tenant_id column
- Table clientes missing tenant_id column
- Table contas_pagar missing tenant_id column
- Table contas_receber missing tenant_id column
- Table cores missing tenant_id column
- Table produtos missing tenant_id column

### Medium Issues
- Extra table in database: __drizzle_migrations

### Low Issues
- Financial consistency check skipped due to column mismatch

## Phase 2: COMPLETED

### Critical Issues
- Schema table pendencias missing in database
- Schema table cliente_vendedores missing in database
- Schema table idempotency_keys missing in database
- Schema table boletos missing in database
- Schema table caixa_mensal missing in database
- Schema table promocoes missing in database
- Schema table promocoes_itens missing in database

### Medium Issues
- Column tenantId in schema.ts not found in database table cargas
- Column tenantId in schema.ts not found in database table clientes
- Column tenantId in schema.ts not found in database table contas_pagar
- Column tenantId in schema.ts not found in database table contas_receber
- Column tenantId in schema.ts not found in database table cores
- Column tenantId in schema.ts not found in database table pedidos
- Column tenantId in schema.ts not found in database table produtos
- Column nomeEmpresa in schema.ts not found in database table tenants
- Column openId in schema.ts not found in database table users
- Column tenantId in schema.ts not found in database table vendedores
- Column userId in schema.ts not found in database table vendedores

## Phase 3: COMPLETED

### Critical Issues
- Service leo-semantic-memory.service.ts has direct DB access without guard
- Service stock-safety.service.ts has direct DB access without guard
- Service system\health.service.ts has direct DB access without guard

### High Issues
- Service ai\_unstable\alerts.service.ts accesses tenant data without tenantId parameter
- Service client.service.ts accesses tenant data without tenantId parameter
- Service concurrency-test.service.ts accesses tenant data without tenantId parameter
- Service order.service.ts accesses tenant data without tenantId parameter
- Service product.service.ts accesses tenant data without tenantId parameter
- Service system-db-check.service.ts accesses tenant data without tenantId parameter
- Service system-health.service.ts accesses tenant data without tenantId parameter
- Service system-test.service.ts accesses tenant data without tenantId parameter

## Phase 4: COMPLETED

### Critical Issues
- Route clientes.ts accesses data without tenantMiddleware
- Route concurrency-test.ts accesses data without tenantMiddleware
- Route concurrency-test.ts has public endpoint accessing sensitive data
- Route dashboard.ts accesses data without tenantMiddleware
- Route pedidos.ts accesses data without tenantMiddleware
- Route produtos.ts accesses data without tenantMiddleware

### High Issues
- Route clientes.ts accesses data without auth guard
- Route concurrency-test.ts accesses data without auth guard
- Route pedidos.ts accesses data without auth guard
- Route produtos.ts accesses data without auth guard

## Phase 5: COMPLETED

### Medium Issues
- Less than 2 tenants in database - cannot test cross-tenant isolation

## Phase 6: COMPLETED

### High Issues
- Script db-snapshot.mjs accesses DB without tenant context
- Script verify-mysql.ts accesses DB without tenant context

### Medium Issues
- Script test-service-responses-expanded.ts has hardcoded tenant_id: 1 occurrences
- Script test-service-responses.ts has hardcoded tenant_id: 1 occurrences

## Phase 7: COMPLETED

### Critical Issues
- Direct DB query: config\database.ts
- Direct DB query: infra\mysql-instrumentation.ts
- Direct DB query: monitoring\health-watchdog.ts
- Direct DB query: scripts\verify-connections.ts
- Direct DB query: scripts\verify-system-checks.ts
- Direct DB query: services\leo-semantic-memory.service.ts
- Direct DB query: services\system\health.service.ts
- Direct DB query: types\service-audit.ts
- Direct DB query: _core\db-bootstrap.ts
- Direct DB query: _core\index.ts
- Drizzle import: db\core.ts
- Drizzle import: scripts\test-db-connection.ts
- Drizzle import: services\ai\_unstable\alerts.service.ts
- Drizzle import: services\ai\_unstable\app-discovery.service.ts
- Drizzle import: services\ai\_unstable\business-insights.ts
- Drizzle import: services\ai\_unstable\finance-engine.ts
- Drizzle import: services\ai\_unstable\financial-insights.service.ts
- Drizzle import: services\ai\_unstable\insight-engine.ts
- Drizzle import: services\ai\_unstable\prediction-engine.ts
- Drizzle import: services\ai\_unstable\sales-analytics.service.ts
- Drizzle import: services\ai\_unstable\stock-analytics.service.ts
- Drizzle import: services\alerts\alerts.service.ts
- Drizzle import: services\analytics-optimizer.ts
- Drizzle import: services\assistant\assistant.service.ts
- Drizzle import: services\audit-log.service.ts
- Drizzle import: services\audit-service.ts
- Drizzle import: services\backup.service.ts
- Drizzle import: services\boot-validation.service.ts
- Drizzle import: services\bootstrap.service.ts
- Drizzle import: services\clientes.service.ts
- Drizzle import: services\configuracoes.service.ts
- Drizzle import: services\core-business-real.test.ts
- Drizzle import: services\dashboard-insights.service.ts
- Drizzle import: services\database-health.service.ts
- Drizzle import: services\finance.service.ts
- Drizzle import: services\financial-idempotency.ts
- Drizzle import: services\inventory.service.ts
- Drizzle import: services\logistica.service.ts
- Drizzle import: services\metrics.service.ts
- Drizzle import: services\orders.service.ts
- Drizzle import: services\pendencias.service.ts
- Drizzle import: services\promocoes.service.ts
- Drizzle import: services\reports\pdf.service.ts
- Drizzle import: services\reports.service.ts
- Drizzle import: services\safe-stock.ts
- Drizzle import: services\safe-transaction.ts
- Drizzle import: services\schema-runtime-guard.ts
- Drizzle import: services\stock-safety.service.ts
- Drizzle import: services\system-monitor.ts
- Drizzle import: services\system.service.ts
- Drizzle import: services\tenant-validation.service.ts
- Drizzle import: services\users.service.ts
- Drizzle import: tests\concurrency-test.ts
- Drizzle import: tests\database-consistency.test.ts
- Drizzle import: tests\multi-tenant-isolation.test.ts
- Drizzle import: tests\multitenant\tenant-isolation.test.ts
- Drizzle import: tests\multitenant\tenant-service.test.ts
- Drizzle import: tests\security\vendedor-cliente-isolation.service.test.ts
- Drizzle import: tests\security\vendedor-finance-isolation.service.test.ts
- Drizzle import: tests\setup-test-data.ts
- Drizzle import: _core\db-safety.ts
- LEO imports service directly: leo\actions\leo-actions.ts
- LEO imports service directly: leo\actions\leo-automation.ts
- LEO imports service directly: leo\actions\leo-computer-control.ts
- LEO imports service directly: leo\automation\desktop-automation.ts
- LEO imports service directly: leo\core\task-queue.ts
- LEO imports service directly: leo\engine\leo-loop.ts
- LEO imports service directly: leo\engine\leo-scheduler.ts
- LEO imports service directly: leo\engine\leo-supervisor.ts
- LEO imports service directly: leo\index.ts
- LEO imports service directly: leo\intelligence\leo-sales-analysis.ts
- LEO imports service directly: leo\intelligence\leo-stock-monitor.ts
- LEO imports service directly: leo\learning\leo-learning-engine.ts
- LEO imports service directly: leo\leo-watchdog.ts
- LEO imports service directly: leo\memory\leo-events.ts
- LEO imports service directly: leo\memory\leo-memory.service.ts
- LEO imports service directly: leo\memory\leo-memory.ts
- LEO imports service directly: leo\memory\leo-semantic-memory.ts
- LEO imports service directly: leo\operator\leo-operator-mode.ts
- LEO imports service directly: leo\perception\leo-ocr.ts
- LEO imports service directly: leo\perception\leo-screen.ts
- LEO imports service directly: leo\perception\leo-system-monitor.ts
- LEO imports service directly: leo\planning\leo-insights.ts
- LEO imports service directly: leo\planning\leo-planner.ts
- LEO imports service directly: leo\planning\leo-scheduler.ts
- LEO imports service directly: leo\security\leo-loop-protection.ts
- LEO imports service directly: leo\security\leo-permissions.ts
- LEO imports service directly: leo\tasks\leo-task-queue.ts
- LEO imports service directly: leo\tools\clientes\clientes.tool.ts
- LEO imports service directly: leo\tools\estoque\estoque.tool.ts
- LEO imports service directly: leo\tools\financeiro\financeiro.tool.ts
- LEO imports service directly: leo\tools\logistica\logistica.tool.ts
- LEO imports service directly: leo\tools\pedidos\pedidos.tool.ts
- LEO imports service directly: leo\utils\leo-notifier.ts
- LEO imports service directly: leo\__tests__\leo-tenant-required.test.ts
- LEO imports service directly: leo\__tests__\tenant-required.test.ts

