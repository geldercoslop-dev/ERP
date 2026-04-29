import { tracer } from '../infra/tracing.js';
import { performanceRegistry, getPerformanceDashboard } from '../infra/performance-logging.js';
import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('tracing-validation');

interface TestResult {
  test: string;
  status: 'passed' | 'failed';
  message: string;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Teste de tracing completo
 */
export class TracingValidator {
  private testResults: TestResult[] = [];
  
  /**
   * Testa geração de trace IDs
   */
  async testTraceIdGeneration(): Promise<void> {
    logger.info('Testing trace ID generation');
    
    try {
      const traceId1 = tracer.generateTraceId();
      const traceId2 = tracer.generateTraceId();
      
      // Verificar unicidade
      const unique = traceId1 !== traceId2;
      
      // Verificar formato (32 chars sem hyphens)
      const formatValid = /^[a-f0-9]{32}$/.test(traceId1);
      
      this.testResults.push({
        test: 'trace_id_generation',
        status: unique && formatValid ? 'passed' : 'failed',
        message: unique && formatValid ? 'Trace IDs generated correctly' : 'Trace ID generation failed',
        details: {
          traceId1,
          traceId2,
          unique,
          formatValid,
        },
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'trace_id_generation',
        status: 'failed',
        message: 'Error generating trace IDs',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Testa criação e finalização de spans
   */
  async testSpanLifecycle(): Promise<void> {
    logger.info('Testing span lifecycle');
    
    try {
      // Criar span
      const span = tracer.startSpan('test_operation', undefined, {
        'test.tag': 'test_value',
      });
      
      const startTime = span.startTime;
      const spanId = span.spanId;
      const traceId = span.traceId;
      
      // Verificar propriedades
      const hasRequiredProps = spanId && traceId && startTime && span.operationName === 'test_operation';
      
      // Adicionar logs
      tracer.logToSpan(span.spanId, 'info', 'Test log message', { key: 'value' });
      
      // Esperar um pouco para ter duração
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Finalizar span
      const finishedSpan = tracer.finishSpan(span.spanId);
      
      // Verificar finalização
      const hasEndTime = finishedSpan.endTime !== undefined;
      const hasDuration = finishedSpan.duration !== undefined && finishedSpan.duration > 0;
      const hasLogs = finishedSpan.logs && finishedSpan.logs.length > 0;
      
      this.testResults.push({
        test: 'span_lifecycle',
        status: hasRequiredProps && hasEndTime && hasDuration && hasLogs ? 'passed' : 'failed',
        message: hasRequiredProps && hasEndTime && hasDuration && hasLogs ? 
          'Span lifecycle completed correctly' : 'Span lifecycle failed',
        details: {
          spanId,
          traceId,
          operationName: finishedSpan.operationName,
          startTime,
          endTime: finishedSpan.endTime,
          duration: finishedSpan.duration,
          logsCount: finishedSpan.logs?.length || 0,
          hasRequiredProps,
          hasEndTime,
          hasDuration,
          hasLogs,
        },
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'span_lifecycle',
        status: 'failed',
        message: 'Error in span lifecycle',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Testa spans aninhados (parent-child)
   */
  async testNestedSpans(): Promise<void> {
    logger.info('Testing nested spans');
    
    try {
      // Criar span pai
      const parentSpan = tracer.startSpan('parent_operation');
      
      // Criar span filho
      const childSpan = tracer.startSpan(
        'child_operation',
        tracer.getCurrentContext(parentSpan.spanId) || undefined
      );
      
      // Verificar relacionamento
      const correctParent = childSpan.parentSpanId === parentSpan.spanId;
      const sameTrace = childSpan.traceId === parentSpan.traceId;
      
      // Finalizar spans em ordem
      tracer.finishSpan(childSpan.spanId);
      tracer.finishSpan(parentSpan.spanId);
      
      // Verificar spans completados
      const completedSpans = tracer.getCompletedSpans(10);
      const parentCompleted = completedSpans.find(s => s.spanId === parentSpan.spanId);
      const childCompleted = completedSpans.find(s => s.spanId === childSpan.spanId);
      
      const bothCompleted = parentCompleted && childCompleted;
      
      this.testResults.push({
        test: 'nested_spans',
        status: correctParent && sameTrace && bothCompleted ? 'passed' : 'failed',
        message: correctParent && sameTrace && bothCompleted ? 
          'Nested spans work correctly' : 'Nested spans failed',
        details: {
          parentSpanId: parentSpan.spanId,
          childSpanId: childSpan.spanId,
          parentTraceId: parentSpan.traceId,
          childTraceId: childSpan.traceId,
          correctParent,
          sameTrace,
          bothCompleted,
        },
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'nested_spans',
        status: 'failed',
        message: 'Error in nested spans',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Testa medição de performance
   */
  async testPerformanceMeasurement(): Promise<void> {
    logger.info('Testing performance measurement');
    
    try {
      // Limpar métricas anteriores
      performanceRegistry.cleanup(0);
      
      // Simular operação com medição
      const startTime = Date.now();
      
      // Criar span e medir
      const span = tracer.startSpan('performance_test');
      
      // Simular trabalho
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Finalizar span
      tracer.finishSpan(span.spanId);
      
      const duration = Date.now() - startTime;
      
      // Verificar métricas registradas
      const dashboard = getPerformanceDashboard(60000); // 1 minuto
      
      const hasOperations = dashboard.summary.totalOperations > 0;
      const hasDuration = dashboard.summary.averageDuration > 0;
      const hasValidDuration = dashboard.summary.averageDuration >= 40; // Pelo menos 40ms
      
      this.testResults.push({
        test: 'performance_measurement',
        status: hasOperations && hasDuration && hasValidDuration ? 'passed' : 'failed',
        message: hasOperations && hasDuration && hasValidDuration ? 
          'Performance measurement working' : 'Performance measurement failed',
        details: {
          expectedMinDuration: 40,
          actualDuration: dashboard.summary.averageDuration,
          totalOperations: dashboard.summary.totalOperations,
          hasOperations,
          hasDuration,
          hasValidDuration,
        },
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'performance_measurement',
        status: 'failed',
        message: 'Error in performance measurement',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Testa logging estruturado
   */
  async testStructuredLogging(): Promise<void> {
    logger.info('Testing structured logging');
    
    try {
      // Criar span
      const span = tracer.startSpan('logging_test');
      
      // Adicionar diferentes tipos de logs
      tracer.logToSpan(span.spanId, 'info', 'Info message', { key: 'value' });
      tracer.logToSpan(span.spanId, 'warn', 'Warning message', { warning: true });
      tracer.logToSpan(span.spanId, 'error', 'Error message', { error: true });
      
      // Adicionar tags
      tracer.setTags(span.spanId, {
        'custom.tag': 'custom_value',
        'number.tag': 42,
      });
      
      // Finalizar span com erro
      const testError = new Error('Test error for logging');
      tracer.finishSpan(span.spanId, testError);
      
      // Verificar span finalizado
      const completedSpans = tracer.getCompletedSpans(10);
      const testSpan = completedSpans.find(s => s.spanId === span.spanId);
      
      const hasLogs = testSpan && testSpan.logs && testSpan.logs.length >= 3;
      const hasTags = testSpan && testSpan.tags && Object.keys(testSpan.tags).length > 2;
      const hasError = testSpan && testSpan.status === 'error' && testSpan.error;
      
      this.testResults.push({
        test: 'structured_logging',
        status: hasLogs && hasTags && hasError ? 'passed' : 'failed',
        message: hasLogs && hasTags && hasError ? 
          'Structured logging working' : 'Structured logging failed',
        details: {
          logsCount: testSpan?.logs?.length || 0,
          tagsCount: testSpan?.tags ? Object.keys(testSpan.tags).length : 0,
          hasError,
          hasLogs,
          hasTags,
        },
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'structured_logging',
        status: 'failed',
        message: 'Error in structured logging',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Testa propagação de contexto
   */
  async testContextPropagation(): Promise<void> {
    logger.info('Testing context propagation');
    
    try {
      // Criar span inicial
      const rootSpan = tracer.startSpan('root_operation');
      const rootContext = tracer.getCurrentContext(rootSpan.spanId);
      
      // Verificar contexto
      const hasTraceId = rootContext && rootContext.traceId;
      const hasSpanId = rootContext && rootContext.spanId;
      const noParentSpan = rootContext && !rootContext.parentSpanId;
      
      // Criar span filho com contexto propagado
      const childSpan = tracer.startSpan('child_operation', rootContext || undefined);
      const childContext = tracer.getCurrentContext(childSpan.spanId);
      
      // Verificar propagação
      const sameTrace = childContext && childContext.traceId === rootContext?.traceId;
      const correctParent = childContext && childContext.parentSpanId === rootContext?.spanId;
      
      // Finalizar spans
      tracer.finishSpan(childSpan.spanId);
      tracer.finishSpan(rootSpan.spanId);
      
      this.testResults.push({
        test: 'context_propagation',
        status: hasTraceId && hasSpanId && noParentSpan && sameTrace && correctParent ? 'passed' : 'failed',
        message: hasTraceId && hasSpanId && noParentSpan && sameTrace && correctParent ? 
          'Context propagation working' : 'Context propagation failed',
        details: {
          rootTraceId: rootContext?.traceId,
          rootSpanId: rootContext?.spanId,
          childTraceId: childContext?.traceId,
          childSpanId: childContext?.spanId,
          childParentSpanId: childContext?.parentSpanId,
          hasTraceId,
          hasSpanId,
          noParentSpan,
          sameTrace,
          correctParent,
        },
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'context_propagation',
        status: 'failed',
        message: 'Error in context propagation',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Testa estatísticas e dashboard
   */
  async testStatsAndDashboard(): Promise<void> {
    logger.info('Testing stats and dashboard');
    
    try {
      // Limpar dados anteriores
      performanceRegistry.cleanup(0);
      
      // Criar spans de teste
      const operations = ['fast_op', 'slow_op', 'error_op'];
      
      for (const op of operations) {
        const span = tracer.startSpan(op);
        
        if (op === 'slow_op') {
          await new Promise(resolve => setTimeout(resolve, 100));
        } else if (op === 'error_op') {
          await new Promise(resolve => setTimeout(resolve, 50));
          tracer.finishSpan(span.spanId, new Error('Test error'));
          continue;
        } else {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        tracer.finishSpan(span.spanId);
      }
      
      // Obter dashboard
      const dashboard = getPerformanceDashboard(60000);
      
      // Verificar dados
      const hasOperations = dashboard.summary.totalOperations >= 3;
      const hasAverageDuration = dashboard.summary.averageDuration > 0;
      const hasErrorRate = dashboard.summary.errorRate > 0; // Deve ter erro do error_op
      const hasByType = Object.keys(dashboard.byType).length > 0;
      
      this.testResults.push({
        test: 'stats_and_dashboard',
        status: hasOperations && hasAverageDuration && hasErrorRate && hasByType ? 'passed' : 'failed',
        message: hasOperations && hasAverageDuration && hasErrorRate && hasByType ? 
          'Stats and dashboard working' : 'Stats and dashboard failed',
        details: {
          totalOperations: dashboard.summary.totalOperations,
          averageDuration: dashboard.summary.averageDuration,
          errorRate: dashboard.summary.errorRate,
          typesCount: Object.keys(dashboard.byType).length,
          hasOperations,
          hasAverageDuration,
          hasErrorRate,
          hasByType,
        },
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'stats_and_dashboard',
        status: 'failed',
        message: 'Error in stats and dashboard',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Executa todos os testes
   */
  async runAllTests(): Promise<void> {
    logger.info('Starting tracing validation tests');
    
    this.testResults = [];
    
    try {
      await this.testTraceIdGeneration();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this.testSpanLifecycle();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this.testNestedSpans();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this.testPerformanceMeasurement();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this.testStructuredLogging();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this.testContextPropagation();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this.testStatsAndDashboard();
      
      logger.info('Tracing validation tests completed', {
        metadata: {
          totalTests: this.testResults.length,
          passedTests: this.testResults.filter(r => r.status === 'passed').length,
          failedTests: this.testResults.filter(r => r.status === 'failed').length,
        },
      });
      
    } catch (error) {
      logger.error('Tracing validation test suite failed', error as Error);
    }
  }
  
  /**
   * Obtém resultados dos testes
   */
  getResults(): TestResult[] {
    return this.testResults;
  }
  
  /**
   * Obtém resumo dos testes
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    results: TestResult[];
  } {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.status === 'passed').length;
    const failed = this.testResults.filter(r => r.status === 'failed').length;
    
    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total) * 100 : 0,
      results: this.testResults,
    };
  }
}

/**
 * Executa validação completa do tracing
 */
export async function runTracingValidation(): Promise<{
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: TestResult[];
}> {
  const validator = new TracingValidator();
  await validator.runAllTests();
  return validator.getSummary();
}
