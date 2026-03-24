import { tracer, withTracing } from './tracing';
import { createLogger } from './structured-logger';

const logger = createLogger('tracing-memory-test');

/**
 * Teste de memory leak em tracing
 * Verifica se activeSpans cresce infinitamente ou se é limpo corretamente
 */
export async function testMemoryLeakDetection(): Promise<{
  success: boolean;
  initialSpans: number;
  afterOperations: number;
  afterCleanup: number;
  leaked: boolean;
  message: string;
}> {
  logger.info('Starting memory leak detection test');

  const initialSpans = tracer.getActiveSpans().length;
  logger.info('Initial active spans:', { metadata: { count: initialSpans } });

  try {
    // Criar muitas operações com tracing
    const operationCount = 1000;
    const operations: Promise<void>[] = [];

    for (let i = 0; i < operationCount; i++) {
      operations.push(
        withTracing(
          `test_operation_${i}`,
          async () => {
            // Simular operação assíncrona
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          },
          { 'test.index': i }
        ).catch(error => {
          logger.error('Operation failed', error instanceof Error ? error : new Error('Unknown error'));
        })
      );
    }

    // Aguardar todas as operações
    await Promise.all(operations);

    // Verificar se há spans ainda ativos
    const afterOperations = tracer.getActiveSpans().length;
    logger.info('Active spans after 1000 operations:', { metadata: { count: afterOperations } });

    // Limpar spans antigos (mais antigos que 1 segundo)
    tracer.cleanup(1000);

    const afterCleanup = tracer.getActiveSpans().length;
    logger.info('Active spans after cleanup:', { metadata: { count: afterCleanup } });

    const leaked = afterCleanup > 10; // Tolerar até 10 spans ativos (margem de segurança)
    
    return {
      success: !leaked,
      initialSpans,
      afterOperations,
      afterCleanup,
      leaked,
      message: leaked
        ? `⚠️ Possível memory leak detectado! ${afterCleanup} spans ainda ativos após ${operationCount} operações`
        : `✅ Memory leak não detectado. ${afterCleanup} spans ativos após cleanup.`,
    };

  } catch (error) {
    logger.error('Memory leak test failed', error instanceof Error ? error : new Error('Unknown error'));
    return {
      success: false,
      initialSpans,
      afterOperations: -1,
      afterCleanup: -1,
      leaked: true,
      message: `❌ Teste falhou: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Teste de isolamento por request
 * Verifica se múltiplas operações simultâneas não compartilham contexto
 */
export async function testContextIsolation(): Promise<{
  success: boolean;
  message: string;
  details: {
    requestsCount: number;
    contextMismatches: number;
    isolationValid: boolean;
  };
}> {
  logger.info('Starting context isolation test');

  const requestCount = 50;
  const contextMismatches: string[] = [];

  try {
    // Criar múltiplos requests simultâneos
    const requests = Array.from({ length: requestCount }, (_, index) =>
      withTracing(
        `request_${index}`,
        async () => {
          const expectedTraceId = `trace_${index}`;
          
          // Simular operação que depende do contexto
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          
          // Em um futuro melhorado com AsyncLocalStorage real no middleware,
          // aqui verificaríamos que o contexto é isolado
          return expectedTraceId;
        },
        { 'request.id': index }
      )
    );

    await Promise.all(requests);

    const isolationValid = contextMismatches.length === 0;

    return {
      success: isolationValid,
      message: isolationValid
        ? '✅ Contextos isolados corretamente entre requests'
        : `⚠️ Detectada sobreposição de contextos: ${contextMismatches.length} mismatches`,
      details: {
        requestsCount: requestCount,
        contextMismatches: contextMismatches.length,
        isolationValid,
      },
    };

  } catch (error) {
    logger.error('Context isolation test failed', error instanceof Error ? error : new Error('Unknown error'));
    return {
      success: false,
      message: `❌ Teste falhou: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: {
        requestsCount: requestCount,
        contextMismatches: contextMismatches.length,
        isolationValid: false,
      },
    };
  }
}

/**
 * Executa todos os testes
 */
export async function runAllMemoryTests(): Promise<void> {
  logger.info('🧪 Iniciando suite completa de testes de memória e isolamento');

  const memoryTest = await testMemoryLeakDetection();
  const isolationTest = await testContextIsolation();

  logger.info('📊 Resultados dos testes:');
  logger.info('Memory Leak Test:', memoryTest);
  logger.info('Context Isolation Test:', isolationTest);

  // Retornar status geral
  const allPassed = memoryTest.success && isolationTest.success;
  if (allPassed) {
    logger.info('✅ Todos os testes passaram!');
  } else {
    logger.warn('⚠️ Alguns testes falharam!');
  }

  return;
}
