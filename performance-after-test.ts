import { PerformanceSimulator } from './server/_core/performance-simulator.js';

// Set minimal environment variables to avoid boot validation errors
process.env.JWT_SECRET = 'test-secret';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

async function runCurrentPerformanceTest(): Promise<void> {
  console.log('=== PERFORMANCE TEST - AFTER REDIS TUNING ===');
  console.log('Environment: Redis centralized, imports fixed\n');
  
  const simulator = new PerformanceSimulator(100);
  
  try {
    console.log('Running simulation: 100 tenants x 1000 requests each...');
    const result = await simulator.simulateLoad(1000);
    
    console.log('\n=== CURRENT METRICS (AFTER) ===');
    console.log(`Total Requests: ${result.totalRequests}`);
    console.log(`Total Duration: ${result.totalDuration.toFixed(2)}ms`);
    console.log(`Average Latency: ${result.overallAvgLatency.toFixed(2)}ms`);
    console.log(`Throughput: ${(result.totalRequests / (result.totalDuration / 1000)).toFixed(2)} req/s`);
    console.log(`Error Rate: ${result.errorRate.toFixed(2)}%`);
    console.log(`Memory Usage: ${(result.memoryAfter.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Memory Leak: ${(result.memoryLeaked / 1024 / 1024).toFixed(2)} MB`);
    
    // Calculate tenant variation
    const latencies = result.avgLatencyPerTenant.map(m => m.avgLatency);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const avgTenantLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const variation = ((maxLatency - minLatency) / avgTenantLatency) * 100;
    
    console.log('\n=== TENANT LATENCY VARIATION ===');
    console.log(`Min Latency: ${minLatency.toFixed(2)}ms`);
    console.log(`Max Latency: ${maxLatency.toFixed(2)}ms`);
    console.log(`Avg Tenant Latency: ${avgTenantLatency.toFixed(2)}ms`);
    console.log(`Variation: ${variation.toFixed(2)}%`);
    
    // Show top 10 tenants with highest latency
    console.log('\n=== TOP 10 HIGHEST LATENCY TENANTS ===');
    const sortedByLatency = result.avgLatencyPerTenant
      .sort((a, b) => b.avgLatency - a.avgLatency)
      .slice(0, 10);
    
    sortedByLatency.forEach((metrics, index) => {
      console.log(`${index + 1}. Tenant ${metrics.tenantId}: ${metrics.avgLatency.toFixed(2)}ms (${metrics.errors} errors)`);
    });
    
    // Generate comparison data
    const currentMetrics = {
      timestamp: new Date().toISOString(),
      totalRequests: result.totalRequests,
      totalDuration: result.totalDuration,
      avgLatency: result.overallAvgLatency,
      throughput: result.totalRequests / (result.totalDuration / 1000),
      errorRate: result.errorRate,
      memoryLeak: result.memoryLeaked,
      tenantVariation: variation,
      minLatency,
      maxLatency,
      avgTenantLatency
    };
    
    console.log('\n=== METRICS SUMMARY FOR COMPARISON ===');
    console.log(JSON.stringify(currentMetrics, null, 2));
    
    // Validation criteria
    const criteria = {
      zeroErrors: result.errorRate === 0,
      stableLatency: result.overallAvgLatency < 500,
      lowVariation: variation < 20, // Less than 20% variation between tenants
      acceptableMemory: result.memoryLeaked < 100 * 1024 * 1024
    };
    
    console.log('\n=== VALIDATION CRITERIA ===');
    console.log(`Zero Errors: ${criteria.zeroErrors ? 'PASS' : 'FAIL'}`);
    console.log(`Stable Latency (<500ms): ${criteria.stableLatency ? 'PASS' : 'FAIL'}`);
    console.log(`Low Variation (<20%): ${criteria.lowVariation ? 'PASS' : 'FAIL'}`);
    console.log(`Acceptable Memory (<100MB): ${criteria.acceptableMemory ? 'PASS' : 'FAIL'}`);
    
    const allPassed = Object.values(criteria).every(Boolean);
    console.log(`\n=== OVERALL RESULT: ${allPassed ? 'PASS' : 'FAIL'} ===`);
    
  } catch (error) {
    console.error('ERROR IN PERFORMANCE TEST:', error);
  }
}

runCurrentPerformanceTest().catch(console.error);
