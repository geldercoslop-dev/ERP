/**
 * TESTE REAL DE CONCORRÊNCIA - 20 EXECUÇÕES SIMULTÂNEAS
 * 
 * Este teste simula 20 requests simultâneos para criar pedidos
 * com potencial de conflito (mesmo produto, mesmo cliente)
 * e verifica se o sistema mantém consistência
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

// Carregar .env
dotenv.config({ path: join(rootDir, '.env') });

// Desabilitar service guard para teste
process.env.SERVICE_ENTRY_GUARD = '0';

// Set env vars para passar validação
process.env.APP_SECRET = 'a'.repeat(128);
process.env.JWT_SECRET = 'b'.repeat(128);
process.env.JWT_ACCESS_SECRET = 'c'.repeat(128);
process.env.JWT_REFRESH_SECRET = 'd'.repeat(128);
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/erp_dev';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

// Registrar tsx para carregar TypeScript
require('tsx/esm');

// Importações dinâmicas usando file:// URLs para Windows
const { createPedidoSafe } = await import(pathToFileURL(join(rootDir, 'server/services/orders.service.ts')).href);
const { getDb, pedidos, idempotencyKeys } = await import(pathToFileURL(join(rootDir, 'server/db/index.ts')).href);
const { auditLogs } = await import(pathToFileURL(join(rootDir, 'drizzle/schema.ts')).href);
const { eq } = await import('drizzle-orm');
const { runWithServiceInvocationAsync, buildBootstrapInvocation } = await import(pathToFileURL(join(rootDir, 'server/_core/service-entry-guard.ts')).href);

const tenantId = Number(process.env.TEST_TENANT_ID || process.argv[2] || 1);
console.log(`📋 Usando tenantId: ${tenantId}`);

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

async function runTest() {
  console.log('🧪 INICIANDO TESTE REAL DE CONCORRÊNCIA (20 EXECUÇÕES)...');
  
  return await runWithServiceInvocationAsync(buildBootstrapInvocation(tenantId), async () => {
    const startTime = Date.now();
    let db;
    
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
    
    const successfulResults = [];
    const failedResults = [];
    
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
      const testPedidos = allPedidos.filter((p) => p.clienteNome === 'Cliente Teste Concorrência');
      
      console.log(`📈 Total de pedidos no banco (tenant): ${allPedidos.length}`);
      console.log(`📈 Pedidos criados no teste: ${testPedidos.length}`);
      
      const idempotencyRecords = await db2.select().from(idempotencyKeys);
      console.log(`🔑 Registros de idempotência: ${idempotencyRecords.length}`);
      
      // Verificar duplicação de números
      const numeros = testPedidos.map((p) => p.numero);
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
        .orderBy((auditLogs) => auditLogs.createdAt);
      
      const testAuditRecords = auditRecords.filter((r) => 
        r.entity === 'pedido' || r.module === 'pedidos'
      );
      
      console.log(`📋 Total audit_log (tenant): ${auditRecords.length}`);
      console.log(`📋 Audit_log do teste: ${testAuditRecords.length}`);
      
      // Conclusão
      console.log('\n📋 CONCLUSÃO:');
      const hasDuplication = numeros.length !== uniqueNumeros.size;
      if (!hasDuplication && successfulCount > 0) {
        console.log('✅ SISTEMA CONSISTENTE - Sem duplicação de números');
      } else if (hasDuplication) {
        console.log('❌ PROBLEMA ENCONTRADO - Duplicação de números detectada');
      } else {
        console.log('⚠️ Nenhum pedido criado - possivelmente erro de validação');
      }
      
      return {
        success: true,
        successfulCount,
        failedCount,
        pedidosCriados: testPedidos.length,
        numerosUnicos: uniqueNumeros.size,
        idempotencyRecords: idempotencyRecords.length,
        auditRecords: testAuditRecords.length,
        duration,
        hasDuplication
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

// Executar teste
runTest().then((result) => {
  console.log('\n🎯 TESTE FINALIZADO');
  process.exit(result.success && !result.hasDuplication ? 0 : 1);
}).catch((error) => {
  console.error('💥 Erro fatal:', error);
  process.exit(1);
});
