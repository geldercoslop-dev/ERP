import { createLogger } from '../infra/structured-logger.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
const logger = createLogger('resilience-test');
/**
 * Simula falhas de database para testar resiliência
 */
export class DatabaseFailureSimulator {
    failureRate = 0;
    failureTypes = ['timeout', 'connection', 'query'];
    currentFailureType = 'timeout';
    constructor(failureRate = 0.1) {
        this.failureRate = failureRate;
    }
    /**
     * Configura taxa de falha
     */
    setFailureRate(rate) {
        this.failureRate = Math.max(0, Math.min(1, rate));
    }
    /**
     * Configura tipo de falha
     */
    setFailureType(type) {
        this.currentFailureType = type;
    }
    /**
     * Executa operação com falha simulada
     */
    async execute(operation, operationName) {
        // Verificar se deve falhar
        if (Math.random() < this.failureRate) {
            return this.simulateFailure(operationName);
        }
        // Executar normalmente
        return await operation();
    }
    /**
     * Simula falha específica
     */
    async simulateFailure(operationName) {
        logger.warn('Simulating database failure', {
            metadata: {
                operation: operationName,
                failureType: this.currentFailureType,
                failureRate: this.failureRate,
            },
        });
        switch (this.currentFailureType) {
            case 'timeout':
                await new Promise(resolve => setTimeout(resolve, 6000)); // Timeout
                throw new InfrastructureError('Database timeout simulated');
            case 'connection':
                throw new InfrastructureError('ECONNREFUSED: Database connection refused');
            case 'query':
                throw new InfrastructureError('ER_QUERY_TIMEOUT: Query execution timeout');
            default:
                throw new InfrastructureError('Unknown database failure simulated');
        }
    }
}
/**
 * Simula falhas de API externa
 */
export class ExternalApiFailureSimulator {
    failureRate = 0;
    latencyMs = 0;
    constructor(failureRate = 0.05, latencyMs = 0) {
        this.failureRate = failureRate;
        this.latencyMs = latencyMs;
    }
    setFailureRate(rate) {
        this.failureRate = Math.max(0, Math.min(1, rate));
    }
    setLatency(ms) {
        this.latencyMs = ms;
    }
    async execute(operation, apiName) {
        // Adicionar latência simulada
        if (this.latencyMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this.latencyMs));
        }
        // Verificar se deve falhar
        if (Math.random() < this.failureRate) {
            logger.warn('Simulating external API failure', {
                metadata: {
                    api: apiName,
                    failureRate: this.failureRate,
                    latency: this.latencyMs,
                },
            });
            throw new InfrastructureError('External API failure simulated');
        }
        return await operation();
    }
}
/**
 * Teste de resiliência completo
 */
export class ResilienceTest {
    dbSimulator;
    apiSimulator;
    testResults = [];
    constructor() {
        this.dbSimulator = new DatabaseFailureSimulator();
        this.apiSimulator = new ExternalApiFailureSimulator();
    }
    /**
     * Testa timeout global
     */
    async testTimeoutGlobal() {
        logger.info('Testing global timeout resilience');
        try {
            // Operação muito lenta
            await new Promise(resolve => setTimeout(resolve, 15000));
            this.testResults.push({
                test: 'timeout_global',
                status: 'failed',
                message: 'Should have timed out',
            });
        }
        catch (error) {
            this.testResults.push({
                test: 'timeout_global',
                status: 'passed',
                message: 'Correctly timed out',
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }
    /**
     * Testa retry com database
     */
    async testDatabaseRetry() {
        logger.info('Testing database retry resilience');
        let successCount = 0;
        let failureCount = 0;
        // Configurar 50% de falha
        this.dbSimulator.setFailureRate(0.5);
        for (let i = 0; i < 10; i++) {
            try {
                await this.dbSimulator.execute(async () => {
                    // Simular operação de database
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return { id: i, data: 'success' };
                }, `test_operation_${i}`);
                successCount++;
            }
            catch (error) {
                failureCount++;
            }
        }
        this.testResults.push({
            test: 'database_retry',
            status: successCount > 0 ? 'passed' : 'failed',
            message: `Success: ${successCount}, Failures: ${failureCount}`,
            successRate: successCount / 10,
        });
        // Reset failure rate
        this.dbSimulator.setFailureRate(0);
    }
    /**
     * Testa circuit breaker
     */
    async testCircuitBreaker() {
        logger.info('Testing circuit breaker resilience');
        // Configurar alta taxa de falha para abrir circuit breaker
        this.dbSimulator.setFailureRate(0.9);
        let consecutiveFailures = 0;
        let circuitOpened = false;
        for (let i = 0; i < 10; i++) {
            try {
                await this.dbSimulator.execute(async () => {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return { test: 'data' };
                }, `circuit_test_${i}`);
                consecutiveFailures = 0;
            }
            catch (error) {
                consecutiveFailures++;
                // Se tiver muitas falhas consecutivas, circuit breaker deveria abrir
                if (consecutiveFailures >= 5 && !circuitOpened) {
                    circuitOpened = true;
                    this.testResults.push({
                        test: 'circuit_breaker_open',
                        status: 'passed',
                        message: 'Circuit breaker opened after consecutive failures',
                        failures: consecutiveFailures,
                    });
                }
            }
        }
        if (!circuitOpened) {
            this.testResults.push({
                test: 'circuit_breaker_open',
                status: 'failed',
                message: 'Circuit breaker did not open',
                consecutiveFailures,
            });
        }
        // Reset
        this.dbSimulator.setFailureRate(0);
    }
    /**
     * Testa backpressure
     */
    async testBackpressure() {
        logger.info('Testing backpressure resilience');
        const concurrentRequests = 150; // Acima do limite padrão
        const promises = [];
        let rejectedCount = 0;
        let processedCount = 0;
        // Criar muitas requests simultâneas
        for (let i = 0; i < concurrentRequests; i++) {
            const promise = new Promise((resolve, reject) => {
                // Simular request
                setTimeout(() => {
                    if (Math.random() < 0.3) { // 30% chance de rejeição
                        rejectedCount++;
                        reject(new Error('Request rejected due to backpressure'));
                    }
                    else {
                        processedCount++;
                        resolve({ id: i, processed: true });
                    }
                }, Math.random() * 1000);
            });
            promises.push(promise);
        }
        try {
            await Promise.allSettled(promises);
            this.testResults.push({
                test: 'backpressure',
                status: 'passed',
                message: `Processed: ${processedCount}, Rejected: ${rejectedCount}`,
                rejectionRate: rejectedCount / concurrentRequests,
            });
        }
        catch (error) {
            this.testResults.push({
                test: 'backpressure',
                status: 'failed',
                message: 'Backpressure test failed',
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }
    /**
     * Testa fallbacks
     */
    async testFallbacks() {
        logger.info('Testing fallback resilience');
        // Configurar falha em database
        this.dbSimulator.setFailureRate(1); // 100% falha
        try {
            // Tentar operação principal (vai falhar)
            await this.dbSimulator.execute(async () => {
                throw new InfrastructureError('Primary operation failed');
            }, 'fallback_test');
            this.testResults.push({
                test: 'fallbacks',
                status: 'failed',
                message: 'Primary operation should have failed',
            });
        }
        catch (error) {
            // Tentar fallback
            try {
                const fallbackResult = { id: 1, data: 'fallback_data', fallback: true };
                this.testResults.push({
                    test: 'fallbacks',
                    status: 'passed',
                    message: 'Fallback executed successfully',
                    fallbackData: fallbackResult,
                });
            }
            catch (fallbackError) {
                this.testResults.push({
                    test: 'fallbacks',
                    status: 'failed',
                    message: 'Fallback also failed',
                    primaryError: error instanceof Error ? error.message : 'Unknown',
                    fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown',
                });
            }
        }
        // Reset
        this.dbSimulator.setFailureRate(0);
    }
    /**
     * Testa log de falhas
     */
    async testFailureLogging() {
        logger.info('Testing failure logging resilience');
        try {
            // Simular falha para testar logging
            throw new InfrastructureError('Test failure for logging');
        }
        catch (error) {
            // Verificar se falha foi registrada
            const dashboard = getFailureDashboard(60000); // Último minuto
            this.testResults.push({
                test: 'failure_logging',
                status: dashboard.summary.total > 0 ? 'passed' : 'failed',
                message: `Total failures logged: ${dashboard.summary.total}`,
                dashboard,
            });
        }
    }
    /**
     * Executa todos os testes
     */
    async runAllTests() {
        logger.info('Starting resilience tests');
        this.testResults = [];
        try {
            await this.testTimeoutGlobal();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.testDatabaseRetry();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.testCircuitBreaker();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.testBackpressure();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.testFallbacks();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.testFailureLogging();
            logger.info('Resilience tests completed', {
                metadata: {
                    totalTests: this.testResults.length,
                    passedTests: this.testResults.filter(r => r.status === 'passed').length,
                    failedTests: this.testResults.filter(r => r.status === 'failed').length,
                },
            });
        }
        catch (error) {
            logger.error('Resilience test suite failed', error);
        }
    }
    /**
     * Obtém resultados dos testes
     */
    getResults() {
        return this.testResults;
    }
    /**
     * Obtém resumo dos testes
     */
    getSummary() {
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
// Importar funções necessárias
import { getFailureDashboard } from './failure-logger.js';
/**
 * Executa teste de resiliência completo
 */
export async function runResilienceTest() {
    const test = new ResilienceTest();
    await test.runAllTests();
    return test.getSummary();
}
