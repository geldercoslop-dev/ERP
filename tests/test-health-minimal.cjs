#!/usr/bin/env node

/**
 * TESTE MÍNIMO: VERIFICAR HEALTH SERVICE
 * Testa o service de health diretamente sem servidor
 */

const path = require('path');

console.log('='.repeat(60));
console.log('TESTE MÍNIMO: HEALTH SERVICE');
console.log('='.repeat(60));

async function testHealthService() {
  try {
    // Configurar environment para teste
    process.env.DATABASE_URL = 'mysql://vendas:vendas123@localhost:3306/vendas_app';
    process.env.NODE_ENV = 'development';
    
    console.log('🔍 Testando service de health diretamente...');
    
    // Importar health service
    const healthServicePath = path.join(__dirname, 'server', 'services', 'system-health.service.js');
    
    // Verificar se existe arquivo compilado
    const fs = require('fs');
    if (!fs.existsSync(healthServicePath)) {
      console.log('❌ Arquivo system-health.service.js não encontrado');
      console.log('💡 Pode precisar compilar TypeScript primeiro');
      return;
    }
    
    // Importar dinamicamente
    const healthModule = require(healthServicePath);
    
    console.log('✅ Health service importado');
    
    // Testar checkDatabase
    if (healthModule.checkDatabase) {
      console.log('\n🔍 Testando checkDatabase...');
      
      try {
        const result = await healthModule.checkDatabase();
        console.log('✅ checkDatabase executado');
        console.log('Resultado:', JSON.stringify(result, null, 2));
        
        if (result.status === 'ok') {
          console.log('✅ DB está conectado e respondendo');
        } else if (result.status === 'error') {
          console.log('❌ DB com erro:', result.error);
        } else {
          console.log('⚠️ DB status inesperado:', result.status);
        }
        
      } catch (error) {
        console.log('❌ Erro no checkDatabase:', error.message);
        
        if (error.message.includes('ECONNREFUSED')) {
          console.log('✅ Erro de conexão detectado (DB offline?)');
        } else if (error.message.includes('ENOTFOUND')) {
          console.log('✅ Host não encontrado (config inválida?)');
        }
      }
    } else {
      console.log('❌ checkDatabase não encontrado no module');
      console.log('Available exports:', Object.keys(healthModule));
    }
    
    // Testar getSystemHealthComplete
    if (healthModule.getSystemHealthComplete) {
      console.log('\n🔍 Testando getSystemHealthComplete...');
      
      try {
        const result = await healthModule.getSystemHealthComplete();
        console.log('✅ getSystemHealthComplete executado');
        console.log('Resultado:', JSON.stringify(result, null, 2));
        
        // Verificar se inclui DB
        if (result.database) {
          console.log('✅ Health completo inclui informações do DB');
        } else {
          console.log('❌ Health completo NÃO inclui DB');
        }
        
      } catch (error) {
        console.log('❌ Erro no getSystemHealthComplete:', error.message);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('CONCLUSÃO');
    console.log('='.repeat(60));
    
    console.log('💡 Para teste completo com DB offline:');
    console.log('1. Pare o MySQL: net stop mysql');
    console.log('2. Execute este teste novamente');
    console.log('3. ESPERADO: checkDatabase deve retornar erro');
    console.log('4. Se não retornar erro → problema no health check');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    console.error('Stack:', error.stack);
  }
}

testHealthService();
