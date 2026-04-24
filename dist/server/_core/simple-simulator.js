import { performance } from 'perf_hooks';
import { BootValidator } from './boot-validator.js';
class PerformanceSimulator {
    tenants = [];
    validator;
    constructor(totalTenants) {
        this.validator = new BootValidator();
        this.tenants = Array.from({ length: totalTenants }, (_, i) => i + 1);
    }
    async simulateLoad(requestsPerTenant) {
        console.log(`\n=== INICIANDO SIMULAÇÃO ===`);
        console.log(`Tenants: ${this.tenants.length}`);
        console.log(`Requests por tenant: ${requestsPerTenant}`);
        console.log(`Total requests: ${this.tenants.length * requestsPerTenant}\n`);
        const memoryBefore = process.memoryUsage();
        const startTime = performance.now();
        const tenantMetrics = [];
        const tenantPromises = this.tenants.map(async (tenantId) => {
            const tenantStartTime = performance.now();
            let errors = 0;
            const requests = Array.from({ length: requestsPerTenant }, async (_, requestId) => {
                try {
                    await this.simulateBootValidation(tenantId);
                }
                catch (error) {
                    errors++;
                }
            });
            await Promise.all(requests);
            const tenantEndTime = performance.now();
            const totalLatency = tenantEndTime - tenantStartTime;
            return {
                tenantId,
                requestCount: requestsPerTenant,
                totalLatency,
                avgLatency: totalLatency / requestsPerTenant,
                errors
            };
        });
        const results = await Promise.all(tenantPromises);
        const endTime = performance.now();
        const memoryAfter = process.memoryUsage();
        const totalDuration = endTime - startTime;
        const totalRequests = this.tenants.length * requestsPerTenant;
        const totalErrors = results.reduce((sum, m) => sum + m.errors, 0);
        const overallAvgLatency = results.reduce((sum, m) => sum + m.avgLatency, 0) / results.length;
        const simulationResult = {
            totalTenants: this.tenants.length,
            totalRequests,
            totalDuration,
            memoryBefore,
            memoryAfter,
            memoryLeaked: memoryAfter.heapUsed - memoryBefore.heapUsed,
            avgLatencyPerTenant: results,
            overallAvgLatency,
            errorRate: (totalErrors / totalRequests) * 100
        };
        this.printResults(simulationResult);
        this.validatePerformance(simulationResult);
        return simulationResult;
    }
    async simulateBootValidation(tenantId) {
        const baseLatency = Math.random() * 50 + 10;
        await this.sleep(baseLatency);
        try {
            if (Math.random() < 0.1) {
                await this.validator.validateBoot();
            }
        }
        catch (error) {
        }
        const workload = Math.random() * 30 + 5;
        await this.sleep(workload);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    printResults(result) {
        console.log('\n=== RESULTADOS DA SIMULAÇÃO ===');
        console.log(`Duração total: ${result.totalDuration.toFixed(2)}ms`);
        console.log(`Requests/s: ${(result.totalRequests / (result.totalDuration / 1000)).toFixed(2)}`);
        console.log(`Latência média: ${result.overallAvgLatency.toFixed(2)}ms`);
        console.log(`Taxa de erro: ${result.errorRate.toFixed(2)}%`);
        console.log('\n=== MEMÓRIA ===');
        console.log(`Antes: ${(result.memoryBefore.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Depois: ${(result.memoryAfter.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Vazamento: ${(result.memoryLeaked / 1024 / 1024).toFixed(2)} MB`);
        console.log('\n=== TOP 10 TENANTS (MAIOR LATÊNCIA) ===');
        const sortedByLatency = result.avgLatencyPerTenant
            .sort((a, b) => b.avgLatency - a.avgLatency)
            .slice(0, 10);
        sortedByLatency.forEach((metrics, index) => {
            console.log(`${index + 1}. Tenant ${metrics.tenantId}: ${metrics.avgLatency.toFixed(2)}ms (${metrics.errors} erros)`);
        });
    }
    validatePerformance(result) {
        console.log('\n=== VALIDAÇÃO DE PERFORMANCE ===');
        const memoryLeakMB = result.memoryLeaked / 1024 / 1024;
        if (memoryLeakMB > 100) {
            console.log(`[ALERTA] Vazamento de memória detectado: ${memoryLeakMB.toFixed(2)} MB`);
        }
        else if (memoryLeakMB > 50) {
            console.log(`[AVISO] Possível vazamento: ${memoryLeakMB.toFixed(2)} MB`);
        }
        else {
            console.log(`[OK] Vazamento de memória aceitável: ${memoryLeakMB.toFixed(2)} MB`);
        }
        if (result.overallAvgLatency > 1000) {
            console.log(`[CRÍTICO] Latência muito alta: ${result.overallAvgLatency.toFixed(2)}ms`);
        }
        else if (result.overallAvgLatency > 500) {
            console.log(`[ALERTA] Latência elevada: ${result.overallAvgLatency.toFixed(2)}ms`);
        }
        else {
            console.log(`[OK] Latência aceitável: ${result.overallAvgLatency.toFixed(2)}ms`);
        }
        if (result.errorRate > 5) {
            console.log(`[CRÍTICO] Taxa de erro muito alta: ${result.errorRate.toFixed(2)}%`);
        }
        else if (result.errorRate > 1) {
            console.log(`[ALERTA] Taxa de erro elevada: ${result.errorRate.toFixed(2)}%`);
        }
        else {
            console.log(`[OK] Taxa de erro aceitável: ${result.errorRate.toFixed(2)}%`);
        }
        const throughput = result.totalRequests / (result.totalDuration / 1000);
        if (throughput < 100) {
            console.log(`[ALERTA] Throughput baixo: ${throughput.toFixed(2)} req/s`);
        }
        else {
            console.log(`[OK] Throughput aceitável: ${throughput.toFixed(2)} req/s`);
        }
    }
    async progressiveStressTest() {
        console.log('\n=== STRESS TEST PROGRESSIVO ===');
        const stages = [
            { tenants: 10, requests: 100 },
            { tenants: 25, requests: 250 },
            { tenants: 50, requests: 500 },
            { tenants: 100, requests: 1000 }
        ];
        for (const stage of stages) {
            console.log(`\n--- ESTÁGIO: ${stage.tenants} tenants, ${stage.requests} requests por tenant ---`);
            this.tenants = Array.from({ length: stage.tenants }, (_, i) => i + 1);
            await this.simulateLoad(stage.requests);
            await this.sleep(2000);
            if (global.gc) {
                global.gc();
            }
        }
    }
}
async function runSimulation() {
    const simulator = new PerformanceSimulator(100);
    try {
        await simulator.simulateLoad(1000);
        await simulator.progressiveStressTest();
    }
    catch (error) {
        console.error('Erro na simulação:', error);
    }
    finally {
        console.log('\n=== SIMULAÇÃO CONCLUÍDA ===');
    }
}
export { PerformanceSimulator };
if (import.meta.url === `file://${process.argv[1]}`) {
    runSimulation().catch(console.error);
}
