import { createPedidoSafe } from '../services/orders.service.js';
import { getDb, pedidos, idempotencyKeys } from '../db/index.js';
import { auditLogs } from "../../drizzle/schema.ts";
import { eq } from 'drizzle-orm';
import { runWithServiceInvocationAsync, buildBootstrapInvocation } from '../_core/service-entry-guard.js';
import { initEnv } from '../_core/env/bootstrapEnv.js';

// Load ENV explicitly (NO import-time side effects)
initEnv();

// Override env vars after loadEnv to ensure they meet validation requirements
process.env.APP_SECRET = 'a'.repeat(128);
process.env.JWT_SECRET = 'b'.repeat(128);
process.env.JWT_ACCESS_SECRET = 'c'.repeat(128);
process.env.JWT_REFRESH_SECRET = 'd'.repeat(128);
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/erp_dev';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

/**
 * TESTE REAL DE CONCORRÊNCIA - 20 EXECUÇÕES SIMULTÂNEAS
 * 
 * Este teste simula 20 requests simultâneos para criar pedidos
 * com potencial de conflito (mesmo produto, mesmo cliente)
 * e verifica se o sistema mantém consistência
 */
async function testConcurrencyReal() {
  console.log('🧪 INICIANDO TESTE REAL DE CONCORRÊNCIA (20 EXECUÇÕES)...');
  const tenantId = Number(process.env.TEST_TENANT_ID || process.argv[2] || 1);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    console.error("❌ TEST_TENANT_ID não fornecido ou inválido. Defina TEST_TENANT_ID como variável de ambiente ou passe como argumento.");
    process.exit(1);
  }
  console.log(`📋 Usando tenantId: ${tenantId}`);

  return await runWithServiceInvocationAsync(buildBootstrapInvocation(tenantId), async () => {
    // Payload controlado - mesmo produto para gerar potencial conflito de estoque
    const pedidoData = {
      vendedorId: 1,
      clienteId: 1,
      cliente: {
        nome: 'Cliente Teste Concorrência',
        telefone: '11999999999',
        rua: 'Rua Teste',
        numero: '123',
        bairro: 'Centro',
        cidade: 'São Paulo',
        uf: 'SP'
      },
      subtotal: 100.00,
      desconto: 0,
      frete: 0,
      total: 100.00,
      formaPagamento: 'DINHEIRO',
      itens: [
        {
          tipo: 'CATALOGO',
          produtoId: 1,
          descricao: 'Produto Teste Concorrência',
          quantidade: 1,
          valorUnitario: 100.00,
          custo: 50.00
        }
      ]
    };

    const startTime = Date.now();
    let db: any;

    try {
      // Limpar registros de idempotência antes do teste
      db = await getDb();
      if (db) {
        await db.delete(idempotencyKeys);
        console.log('✅ Tabela de idempotência limpa');
      }

      // 🔄 SIMULAR 20 REQUESTS SIMULTÂNEOS
      console.log('🚀 Enviando 20 requests simultâneos...');
    
      const promises = Array.from({ length: 20 }, (_, i) => 
        createPedidoSafe(tenantId, pedidoData, { vendedorId: 1 })
      );

      const results = await Promise.allSettled(promises);
      const duration = Date.now() - startTime;
      
      console.log(`⏱️  Tempo total: ${duration}ms`);
      console.log('📊 RESULTADOS:');
      
      const successfulResults: any[] = [];
      const failedResults: any[] = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulResults.push(result.value);
          console.log(`Request ${index + 1}:`, {
            success: result.value.success,
            pedidoId: result.value.pedidoId,
            numero: result.value.numero,
            status: result.value.status
          });
        } else {
          failedResults.push(result.reason);
          console.log(`Request ${index + 1} ERROR:`, result.reason);
        }
      });

      // 🎯 VERIFICAR RESULTADO ESPERADO
      const successfulCount = successfulResults.length;
      const failedCount = failedResults.length;
      
      console.log('\n🔍 ANÁLISE:');
      console.log(`✅ Requests bem-sucedidos: ${successfulCount}`);
      console.log(`❌ Requests falhados: ${failedCount}`);
      
      // Verificar duplicação no banco
      const db2 = await getDb();
      if (db2) {
        const allPedidos = await db2.select().from(pedidos).where(eq(pedidos.tenantId, tenantId));
        const testPedidos = allPedidos.filter((p: any) => p.clienteNome === 'Cliente Teste Concorrência');
        
        console.log(`📈 Total de pedidos no banco (tenant): ${allPedidos.length}`);
        console.log(`📈 Pedidos criados no teste: ${testPedidos.length}`);
        
        const idempotencyRecords = await db2.select().from(idempotencyKeys);
        console.log(`🔑 Registros de idempotência: ${idempotencyRecords.length}`);

        // Verificar duplicação de números
        const numeros = testPedidos.map((p: any) => p.numero);
        const uniqueNumeros = new Set(numeros);
        console.log(`🔢 Números gerados: ${numeros.length}`);
        console.log(`🔢 Números únicos: ${uniqueNumeros.size}`);
        
        if (numeros.length !== uniqueNumeros.size) {
          console.log('❌ DUPLICAÇÃO DE NÚMEROS DETECTADA!');
          const duplicates = numeros.filter((n, i) => numeros.indexOf(n) !== i);
          console.log('Números duplicados:', duplicates);
        }

        // Verificar audit_log
        const auditRecords = await db2.select().from(auditLogs)
          .where(eq(auditLogs.tenantId, tenantId))
          .orderBy((auditLogs: any) => auditLogs.createdAt);
        
        const testAuditRecords = auditRecords.filter((r: any) => 
          r.entity === 'pedido' || r.module === 'pedidos'
        );
        
        console.log(`📋 Total audit_log (tenant): ${auditRecords.length}`);
        console.log(`📋 Audit_log do teste: ${testAuditRecords.length}`);
        
        return {
          success: true,
          successfulCount,
          failedCount,
          pedidosCriados: testPedidos.length,
          numerosUnicos: uniqueNumeros.size,
          idempotencyRecords: idempotencyRecords.length,
          auditRecords: testAuditRecords.length,
          duration,
          hasDuplication: numeros.length !== uniqueNumeros.size
        };
      }
      
      return {
        success: false,
        error: 'DB connection failed'
      };
      
    } catch (error) {
      console.error('💥 Erro no teste:', error);
      return {
        success: false,
        error: String(error)
      };
    }
  });
}

/**
 * TESTE DE LOCK NO ESTOQUE
 */
async function testEstoqueLock() {
  console.log('\n🔒 TESTANDO LOCK NO ESTOQUE...');
  const tenantId = Number(process.env.TEST_TENANT_ID || process.argv[2] || 1);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    console.error("❌ TEST_TENANT_ID não fornecido ou inválido. Defina TEST_TENANT_ID como variável de ambiente ou passe como argumento.");
    process.exit(1);
  }

  return await runWithServiceInvocationAsync(buildBootstrapInvocation(tenantId), async () => {
    const pedidoDataEstoqueBaixo = {
      vendedorId: 1,
      clienteId: 1,
      cliente: {
        nome: 'Cliente Teste Estoque',
        telefone: '11999999998',
        rua: 'Rua Teste',
        numero: '456',
        bairro: 'Centro',
        cidade: 'São Paulo',
        uf: 'SP'
      },
      subtotal: 1000.00,
      desconto: 0,
      frete: 0,
      total: 1000.00,
      formaPagamento: 'DINHEIRO',
      itens: [
        {
          tipo: 'CATALOGO',
          produtoId: 1,
          descricao: ' Produto Teste Estoque',
          quantidade: 999, // Quantidade maior que estoque
          valorUnitario: 50.00,
          custo: 25.00
        }
      ]
    };

    try {
      const result = await createPedidoSafe(tenantId, pedidoDataEstoqueBaixo, { vendedorId: 1 });
    
      console.log('📊 Resultado com estoque insuficiente:', {
        success: result.success,
        status: result.status,
        gerouPendencia: result.gerouPendencia
      });
      
      if (result.status === 'PENDENTE_ESTOQUE' && result.gerouPendencia) {
        console.log('✅ LOCK DE ESTOQUE FUNCIONOU! Pedido com pendência criado.');
        return true;
      } else {
        console.log('❌ LOCK DE ESTOQUE FALHOU!');
        return false;
      }
    
    } catch (error) {
      console.error('💥 Erro no teste de estoque:', error);
      return false;
    }
  });
}

/**
 * EXECUTAR TODOS OS TESTES
 */
export async function runConcurrencyTests() {
  console.log('🚀 INICIANDO TESTES DE CONCORRÊNCIA\n');
  
  const results = {
    concurrency: false,
    estoqueLock: false
  };
  
  try {
    const concurrencyResult = await testConcurrencyReal();
    results.concurrency = concurrencyResult.success && !concurrencyResult.hasDuplication;
    results.estoqueLock = await testEstoqueLock();
    
    console.log('\n📋 RELATÓRIO FINAL:');
    console.log(`✅ Concorrência (20 reqs): ${results.concurrency ? 'FUNCIONANDO' : 'FALHOU'}`);
    console.log(`✅ Lock Estoque: ${results.estoqueLock ? 'FUNCIONANDO' : 'FALHOU'}`);
    
    if (results.concurrency && results.estoqueLock) {
      console.log('🎉 TODOS OS TESTES PASSARAM! Sistema blindado contra concorrência.');
    } else {
      console.log('⚠️ ALGUNS TESTES FALHARAM! Revisar implementação.');
    }
    
  } catch (error) {
    console.error('💥 Erro geral nos testes:', error);
  }
  
  return results;
}

// Executar se chamado diretamente
runConcurrencyTests();
