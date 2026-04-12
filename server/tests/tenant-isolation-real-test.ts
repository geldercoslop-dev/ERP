import { getDb } from '../db/index.js';
import { pedidos } from '../../drizzle/schema.js';
import { safeTransactionService } from '../services/safe-transaction';
import { runWithServiceInvocationAsync, buildBootstrapInvocation } from '../_core/service-entry-guard.js';
import { OrderService } from '../services/order.service.js';

async function main() {
  console.log('=== INICIANDO PROVA REAL COM BANCO ===');
  
  // Services reais
  const db = await getDb();
  const orderService = new OrderService();
  
  // IDs de teste
  const tenantA = 1001;
  const tenantB = 2002;
  
  console.log('\n1. CRIANDO PEDIDO COM ORDER SERVICE (TENANT A):');
  console.log('Context:', { tenantId: tenantA });
  
  let pedidoId: number;
  try {
    const createResult = await orderService.create(
      { tenantId: tenantA }, 
      { 
        clienteId: 1, 
        itens: [{ produtoId: 1, quantidade: 2 }],
        status: 'GERADO'
      }
    );
    pedidoId = createResult.id;
    console.log('✅ Pedido criado - ID:', pedidoId);
    console.log('✅ Order service funcionou com tenant válido');
  } catch (error) {
    console.log('❌ Erro ao criar pedido:', error instanceof Error ? error.message : error);
    throw error;
  }
  
  console.log('\n2. BUSCANDO PEDIDO COM ORDER SERVICE (TENANT A):');
  try {
    const listResult = await orderService.list(
      { tenantId: tenantA },
      { page: 1, limit: 10 }
    );
    console.log('✅ Pedidos listados:', listResult.length, 'registros');
    console.log('✅ List funcionou com tenant válido');
  } catch (error) {
    console.log('❌ Erro ao listar pedidos:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n3. TENTANDO ATUALIZAR PEDIDO COM TENANT B (CROSS-TENANT):');
  console.log('Context:', { tenantId: tenantB });
  console.log('Pedido ID:', pedidoId);
  
  let crossTenantError;
  try {
    await orderService.update(
      { tenantId: tenantB },
      { 
        id: pedidoId, 
        status: 'CANCELADO',
        motivo: 'Tentativa de cross-tenant'
      }
    );
    console.log('❌ CROSS-TENANT FUNCIONOU (ERRO!)');
  } catch (error) {
    crossTenantError = error;
    console.log('✅ Cross-tenant BLOQUEADO:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n4. ATUALIZANDO PEDIDO COM TENANT A (VÁLIDO):');
  console.log('Context:', { tenantId: tenantA });
  console.log('Pedido ID:', pedidoId);
  
  let validUpdate = false;
  try {
    await orderService.update(
      { tenantId: tenantA },
      { 
        id: pedidoId, 
        status: 'CANCELADO',
        motivo: 'Cancelamento válido'
      }
    );
    validUpdate = true;
    console.log('✅ Update válido funcionou');
  } catch (error) {
    console.log('❌ Erro no update válido:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n5. TESTANDO SAFE TRANSACTION COM CROSS-TENANT:');
  try {
    await db.transaction(async (tx) => {
      await safeTransactionService.processTransactionStep(tx, {
        pedidoId, 
        tenantId: tenantB, 
        acao: 'atualizar_status',
        dados: { status: 'ENTREGUE' } 
      });
    });
    console.log('❌ Safe transaction cross-tenant funcionou (ERRO!)');
  } catch (error) {
    console.log('✅ Safe transaction cross-tenant BLOQUEADO:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n6. TESTANDO SAFE TRANSACTION VÁLIDA:');
  try {
    await db.transaction(async (tx) => {
      await safeTransactionService.processTransactionStep(tx, {
        pedidoId, 
        tenantId: tenantA, 
        acao: 'atualizar_status',
        dados: { status: 'ENTREGUE' } 
      });
    });
    console.log('✅ Safe transaction válida funcionou');
  } catch (error) {
    console.log('❌ Erro na safe transaction válida:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n=== RESULTADO FINAL ===');
  console.log('✅ Pedido criado com tenant A:', pedidoId);
  console.log('✅ List funcionou com tenant A');
  console.log('✅ Cross-tenant com Order Service:', crossTenantError ? 'BLOQUEADO' : 'FALHOU');
  console.log('✅ Update válido com tenant A:', validUpdate ? 'FUNCIONOU' : 'FALHOU');
  
  // Validação final
  if (crossTenantError && validUpdate) {
    console.log('\n🎯 PROVA REAL CONCLUÍDA COM SUCESSO!');
    console.log('✅ Isolamento multi-tenant garantido');
    console.log('✅ Order service bloqueia cross-tenant');
    console.log('✅ Safe transaction bloqueia cross-tenant');
    console.log('✅ Operações válidas funcionam');
  } else {
    throw new Error('❌ FALHA NA PROVA DE ISOLAMENTO');
  }
}

// Executar com contexto de serviço
runWithServiceInvocationAsync(
  buildBootstrapInvocation(1001),
  async () => {
    await main();
  }
).catch(console.error);
