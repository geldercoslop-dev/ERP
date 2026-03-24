import { validarDadosBanco } from './test-banco-validation';
import { executarTestesFluxoERP } from './test-fluxo-erp';

async function runAllTests() {
  console.log('🚀 EXECUTANDO TESTES ERP REAL\n');
  
  try {
    // 1. Validar dados existentes
    console.log('='.repeat(50));
    const validation = await validarDadosBanco();
    
    // 2. Executar fluxo completo
    console.log('\n' + '='.repeat(50));
    const fluxoResult = await executarTestesFluxoERP();
    
    console.log('\n🎉 TODOS OS TESTES CONCLUÍDOS!');
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
  }
}

runAllTests();
