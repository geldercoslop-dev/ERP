#!/usr/bin/env tsx
import { initEnv } from "../server/_core/env/bootstrapEnv";
import { bootstrapServer } from "../server/_core/bootstrap.js";

// Carrega variáveis de ambiente antes das validações
initEnv();

// Reduzir verbosidade de logs do bootstrap
process.env.LOG_LEVEL = 'error';

/**
 * VERIFY:AUDIT_LOG_RUNTIME - Runtime validation for audit_logs flow
 *
 * Validates:
 * - Real domain flow (createPedidoSafe → cancelarPedidoSafe → audit_logs)
 * - Official integration helper for scenario creation
 * - audit_logs table receives real records from domain operations
 * - tenantId, action, entity, entityId are correct
 * - Strong cleanup without leaving test data
 * - Uses official database connection
 * - No mocks, no direct DB access, no legacy scripts
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../server/db/index.js";
import { auditLogs } from "../drizzle/schema.js";
import { createSkuOrderScenario, cleanupSkuOrderScenario, type SkuOrderScenario } from "../server/tests/integration/helpers/sku-order-flow.helper.js";
import { createPedidoSafe, cancelarPedidoSafe } from "../server/services/orders.service.js";
import type { ServiceActor } from "../server/_core/service-actor.js";

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message: string) {
  log(message, 'red');
}

function success(message: string) {
  log(message, 'green');
}

function warn(message: string) {
  log(message, 'yellow');
}

function info(message: string) {
  log(message, 'blue');
}

let failed = false;
let scenario: SkuOrderScenario | null = null;
let createdPedidoId: number | null = null;

// ============================================================================
// BOOTSTRAP DO SERVIDOR
// ============================================================================
info('\n🔍 BOOTSTRAP: Initializing server...');

try {
  await bootstrapServer();
  success('✅ Server bootstrap completed');
} catch (e) {
  const err = e as Error;
  error(`❌ Bootstrap failed: ${err.message}`);
  error('Cannot proceed without bootstrap');
  process.exit(1);
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
info('\n' + '='.repeat(60));
info('AUDIT LOG RUNTIME VALIDATION');
info('='.repeat(60));
info('Validating real domain flow: createPedidoSafe → cancelarPedidoSafe → audit_logs');
info('Using official integration helper: server/tests/integration/helpers/sku-order-flow.helper.ts');

// Tenant de teste isolado (deve existir no banco)
const TEST_TENANT_ID = Number(process.env.TEST_TENANT_ID) || 1;
info(`Test Tenant ID: ${TEST_TENANT_ID}`);

// ============================================================================
// TESTE 1: CRIAR CENÁRIO REAL USANDO HELPER OFICIAL
// ============================================================================
info('\n🔍 TEST 1: Create Real Scenario Using Official Helper');

try {
  scenario = await createSkuOrderScenario(TEST_TENANT_ID, {
    scenarioLabel: 'audit-log-runtime',
    initialStock: 100,
  });

  if (!scenario) {
    throw new Error('Scenario creation returned null');
  }

  success('✅ Scenario created successfully');
  info(`   Tenant ID: ${scenario.tenantId}`);
  info(`   User ID: ${scenario.userId}`);
  info(`   Vendedor ID: ${scenario.vendedorId}`);
  info(`   Cliente ID: ${scenario.clienteId}`);
  info(`   SKU Ativo ID: ${scenario.skuAtivoId}`);
} catch (e) {
  const err = e as Error;
  error(`❌ Failed to create scenario: ${err.message}`);
  error('Cannot proceed without scenario');
  failed = true;
  process.exit(1);
}

// ============================================================================
// TESTE 2: CRIAR PEDIDO REAL USANDO SERVICE OFICIAL
// ============================================================================
info('\n🔍 TEST 2: Create Real Pedido Using Official Service');

const actor: ServiceActor = {
  role: 'admin',
  userId: scenario.userId,
  vendedorId: scenario.vendedorId,
};

try {
  const pedidoInput = {
    vendedorId: scenario.vendedorId,
    clienteId: scenario.clienteId,
    itens: [
      {
        tipo: 'CATALOGO' as const,
        produtoId: scenario.produtoId,
        corId: scenario.corId,
        skuId: scenario.skuAtivoId,
        descricao: 'Item de teste audit log',
        quantidade: 1,
        valorUnitario: '100.00',
        custo: '50.00',
        prazoGarantia: 90,
      },
    ],
    subtotal: '100.00',
    desconto: '0.00',
    frete: '0.00',
    total: '100.00',
    formaPagamento: 'DINHEIRO',
  };

  const pedidoResult = await createPedidoSafe(scenario.tenantId, pedidoInput, actor, scenario.vendedorId);

  if (!pedidoResult.success || !pedidoResult.pedidoId) {
    throw new Error(`createPedidoSafe failed: success=${pedidoResult.success}, pedidoId=${pedidoResult.pedidoId}`);
  }

  createdPedidoId = pedidoResult.pedidoId;
  scenario.createdPedidoIds.push(createdPedidoId);
  scenario.createdPedidoNumeros.push(pedidoResult.numero);

  success('✅ Pedido created successfully');
  info(`   Pedido ID: ${createdPedidoId}`);
  info(`   Pedido Numero: ${pedidoResult.numero}`);
  info(`   Status: ${pedidoResult.status}`);
} catch (e) {
  const err = e as Error;
  error(`❌ Failed to create pedido: ${err.message}`);
  failed = true;
  // Cleanup antes de sair
  if (scenario) {
    try {
      await cleanupSkuOrderScenario(scenario);
    } catch (cleanupErr) {
      error(`Cleanup error: ${(cleanupErr as Error).message}`);
    }
  }
  process.exit(1);
}

// ============================================================================
// TESTE 3: CANCELAR PEDIDO REAL USANDO SERVICE OFICIAL
// ============================================================================
info('\n🔍 TEST 3: Cancel Real Pedido Using Official Service');

try {
  const cancelResult = await cancelarPedidoSafe(scenario.tenantId, createdPedidoId, actor);

  if (!cancelResult.success || cancelResult.status !== 'CANCELADO') {
    throw new Error(`cancelarPedidoSafe failed: success=${cancelResult.success}, status=${cancelResult.status}`);
  }

  success('✅ Pedido cancelled successfully');
  info(`   Pedido ID: ${cancelResult.pedidoId}`);
  info(`   Status: ${cancelResult.status}`);
  info(`   Estoque devolvido: ${cancelResult.estoqueDevolvido}`);
  info(`   Contas canceladas: ${cancelResult.contasCanceladas}`);
} catch (e) {
  const err = e as Error;
  error(`❌ Failed to cancel pedido: ${err.message}`);
  failed = true;
  // Cleanup antes de sair
  if (scenario) {
    try {
      await cleanupSkuOrderScenario(scenario);
    } catch (cleanupErr) {
      error(`Cleanup error: ${(cleanupErr as Error).message}`);
    }
  }
  process.exit(1);
}

// ============================================================================
// TESTE 4: VALIDAR REGISTRO EM AUDIT_LOGS
// ============================================================================
info('\n🔍 TEST 4: Validate Record in audit_logs Table');

try {
  const db = await getDb();

  // Buscar registros de audit_log para este pedido
  const auditRecords = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.tenantId, scenario.tenantId),
        eq(auditLogs.entity, 'pedido'),
        eq(auditLogs.entityId, String(createdPedidoId))
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  if (auditRecords.length === 0) {
    error('❌ cancelarPedidoSafe não gravou audit_logs runtime');
    error(`   Pedido ${createdPedidoId} foi cancelado mas não há registros em audit_logs`);
    error('   Isso indica que cancelarPedidoSafe usa insertAuditLog stub vazio em db/core.ts');
    error('   BUG REAL: cancelarPedidoSafe não grava audit_logs por conta própria');
    failed = true;
  }

  success(`✅ Found ${auditRecords.length} audit_logs record(s) for pedido`);

  // Validar se existe registro de CANCELAR_PEDIDO
  const cancelRecord = auditRecords.find(r => r.action === 'CANCELAR_PEDIDO');
  if (!cancelRecord) {
    error('❌ No CANCELAR_PEDIDO action found in audit_logs');
    error('Available actions: ' + auditRecords.map(r => r.action).join(', '));
    failed = true;
  } else {
    success('✅ CANCELAR_PEDIDO record found in audit_logs');

    // Validar campos
    if (cancelRecord.tenantId !== scenario.tenantId) {
      error(`❌ tenantId mismatch: expected ${scenario.tenantId}, got ${cancelRecord.tenantId}`);
      failed = true;
    } else {
      success('✅ tenantId is correct');
    }

    if (cancelRecord.entity !== 'pedido') {
      error(`❌ entity mismatch: expected 'pedido', got '${cancelRecord.entity}'`);
      failed = true;
    } else {
      success('✅ entity is correct');
    }

    if (cancelRecord.entityId !== String(createdPedidoId)) {
      error(`❌ entityId mismatch: expected '${createdPedidoId}', got '${cancelRecord.entityId}'`);
      failed = true;
    } else {
      success('✅ entityId is correct');
    }

    if (cancelRecord.action !== 'CANCELAR_PEDIDO') {
      error(`❌ action mismatch: expected 'CANCELAR_PEDIDO', got '${cancelRecord.action}'`);
      failed = true;
    } else {
      success('✅ action is correct');
    }

    // Validar payloadJson se existir
    if (cancelRecord.payloadJson) {
      try {
        const payload = JSON.parse(cancelRecord.payloadJson);
        success('✅ payloadJson is valid JSON');
        info(`   Payload keys: ${Object.keys(payload).join(', ')}`);
      } catch {
        error('❌ payloadJson is not valid JSON');
        failed = true;
      }
    } else {
      warn('⚠️  payloadJson is null (may be expected)');
    }
  }

  // Listar todos os registros para debug
  info('\n📋 All audit_logs records for this pedido:');
  for (const record of auditRecords) {
    info(`   - ID: ${record.id}, Action: ${record.action}, Entity: ${record.entity}, EntityId: ${record.entityId}`);
  }
} catch (e) {
  const err = e as Error;
  error(`❌ Failed to validate audit_logs: ${err.message}`);
  failed = true;
}

// ============================================================================
// TESTE 5: CLEANUP FORTE - LIMPAR CENÁRIO
// ============================================================================
info('\n🔍 TEST 5: Strong Cleanup - Remove Scenario');

const cleanupErrors: string[] = [];

try {
  if (!scenario) {
    throw new Error('Scenario is null, cannot cleanup');
  }

  await cleanupSkuOrderScenario(scenario);
  success('✅ Scenario cleaned up successfully');
} catch (e) {
  const err = e as Error;
  error(`❌ Cleanup failed: ${err.message}`);
  cleanupErrors.push(err.message);
  failed = true;
}

// ============================================================================
// TESTE 6: CLEANUP FORTE - LIMPAR AUDIT_LOGS DE TESTE
// ============================================================================
info('\n🔍 TEST 6: Strong Cleanup - Remove Test audit_logs Records');

try {
  const db = await getDb();

  // Remover audit_logs do teste (filtrando por entityId do pedido de teste)
  // NOTA: Isso remove APENAS os registros do pedido de teste criado acima
  const deleteResult = await db
    .delete(auditLogs)
    .where(
      and(
        eq(auditLogs.tenantId, scenario.tenantId),
        eq(auditLogs.entity, 'pedido'),
        eq(auditLogs.entityId, String(createdPedidoId))
      )
    );

  success('✅ Test audit_logs records cleaned up successfully');
  info('   Only records from test pedido were removed');
} catch (e) {
  const err = e as Error;
  error(`❌ Failed to cleanup audit_logs: ${err.message}`);
  cleanupErrors.push(err.message);
  failed = true;
}

// ============================================================================
// RESULTADO
// ============================================================================
info('\n' + '='.repeat(60));

if (failed) {
  error('🚨 AUDIT LOG RUNTIME VALIDATION FAILED');
  if (cleanupErrors.length > 0) {
    error('Cleanup errors:');
    cleanupErrors.forEach(err => error(`  - ${err}`));
  }
  error('One or more validation checks failed');
  process.exit(1);
} else {
  success('✅ AUDIT LOG RUNTIME VALIDATION PASSED');
  success('All runtime validation checks passed');
  success('Real domain flow creates audit_logs records correctly');
  success('Strong cleanup completed without leaving test data');
  process.exit(0);
}
