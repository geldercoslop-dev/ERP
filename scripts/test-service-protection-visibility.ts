/**
 * Script para testar a visibilidade dos erros no sistema de proteção
 * 
 * Este script testa se o sistema de proteção está tornando os erros visíveis
 * quando ocorrem, em vez de mascará-los.
 */
import '../server/_core/init-protection';
import { logInfo, logWarning, logError, logCritical, ErrorType } from '../server/_core/service-logger';
import { createSafeService } from '../server/_core/service-safety';
import { getMonitorStatus } from '../server/_core/service-monitor';
import { nanoid } from 'nanoid';

// Mock de serviço com métodos que retornam valores inválidos
const mockService = {
  getUndefined: async () => undefined,
  getNull: async () => null,
  getInvalidArray: async () => 'not an array',
  getValidArray: async () => [1, 2, 3],
  
  listUndefined: async () => undefined,
  listNull: async () => null,
  listInvalidArray: async () => 'not an array',
  listValidArray: async () => [1, 2, 3],
  
  createUndefined: async () => undefined,
  createWithoutId: async () => ({ name: 'test' }),
  createWithId: async () => ({ id: 1, name: 'test' }),
  
  updateUndefined: async () => undefined,
  updateInvalid: async () => 'not an object',
  updateValid: async () => ({ success: true }),
  
  deleteUndefined: async () => undefined,
  deleteInvalid: async () => 'not an object',
  deleteValid: async () => ({ success: true })
};

/**
 * Testa um método e verifica se o erro é visível
 * @param method - O método a ser testado
 * @param expectError - Se deve esperar um erro
 * @param testName - O nome do teste
 */
async function testMethod(
  method: () => Promise<any>,
  expectError: boolean,
  testName: string
): Promise<void> {
  try {
    console.log(`\n🧪 Testando ${testName}...`);
    const result = await method();
    console.log(`✅ Resultado: ${JSON.stringify(result)}`);
    
    if (expectError) {
      console.error(`❌ Erro esperado não foi lançado em ${testName}`);
    } else {
      console.log(`✅ Método executado sem erros, como esperado`);
    }
  } catch (error) {
    if (expectError) {
      console.log(`✅ Erro lançado como esperado em ${testName}: ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.error(`❌ Erro inesperado em ${testName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Testa o sistema de proteção
 */
async function testProtectionVisibility(): Promise<void> {
  console.log('🔍 Iniciando testes de visibilidade de erros...');
  
  // Aplicar proteção ao serviço mock
  const safeService = createSafeService(mockService, 'mockService');
  
  // Testar métodos get/list
  await testMethod(() => safeService.getUndefined(), false, 'safeService.getUndefined');
  await testMethod(() => safeService.getNull(), false, 'safeService.getNull');
  await testMethod(() => safeService.getInvalidArray(), false, 'safeService.getInvalidArray');
  await testMethod(() => safeService.getValidArray(), false, 'safeService.getValidArray');
  
  await testMethod(() => safeService.listUndefined(), false, 'safeService.listUndefined');
  await testMethod(() => safeService.listNull(), false, 'safeService.listNull');
  await testMethod(() => safeService.listInvalidArray(), false, 'safeService.listInvalidArray');
  await testMethod(() => safeService.listValidArray(), false, 'safeService.listValidArray');
  
  // Testar métodos create
  await testMethod(() => safeService.createUndefined(), true, 'safeService.createUndefined');
  await testMethod(() => safeService.createWithoutId(), true, 'safeService.createWithoutId');
  await testMethod(() => safeService.createWithId(), false, 'safeService.createWithId');
  
  // Testar métodos update
  await testMethod(() => safeService.updateUndefined(), false, 'safeService.updateUndefined');
  await testMethod(() => safeService.updateInvalid(), false, 'safeService.updateInvalid');
  await testMethod(() => safeService.updateValid(), false, 'safeService.updateValid');
  
  // Testar métodos delete
  await testMethod(() => safeService.deleteUndefined(), false, 'safeService.deleteUndefined');
  await testMethod(() => safeService.deleteInvalid(), false, 'safeService.deleteInvalid');
  await testMethod(() => safeService.deleteValid(), false, 'safeService.deleteValid');
  
  // Verificar estado do monitor
  console.log('\n📊 Estado do monitor:');
  console.log(JSON.stringify(getMonitorStatus(), null, 2));
  
  console.log('\n✅ Testes concluídos');
}

// Executar os testes
testProtectionVisibility()
  .then(() => {
    console.log('\n🎉 Todos os testes foram concluídos');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erro durante a execução dos testes:', error);
    process.exit(1);
  });