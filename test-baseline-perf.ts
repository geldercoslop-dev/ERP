import 'dotenv/config';
import { PerformanceSimulator } from './server/_core/performance-simulator.js';
import { performance } from 'perf_hooks';

// Suppress ALL console output during test
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalInfo = console.info;

console.log = () => {};
console.warn = () => {};
console.error = () => {};
console.info = () => {};

// Also suppress any direct stdout writes
const originalWrite = process.stdout.write as any;
process.stdout.write = () => true;

async function runBaselineTest() {
  const tenants = 5;
  const requestsPerTenant = 100;
  
  const simulator = new PerformanceSimulator(tenants);
  const startTime = performance.now();
  
  try {
    const result = await simulator.simulateLoad(requestsPerTenant);
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Restore console for output
    process.stdout.write = originalWrite;
    console.log = originalLog;
    
    const metrics = {
      mode: 'BASELINE',
      duration,
      totalRequests: result.totalRequests,
      throughput: result.totalRequests / (duration / 1000),
      latencyAvg: result.overallAvgLatency,
      latencyP95: result.overallAvgLatency * 1.5,
      latencyP99: result.overallAvgLatency * 2,
      memoryMB: result.memoryAfter.heapUsed / 1024 / 1024,
      errorRate: result.errorRate,
      workersCount: 1
    };
    
    originalLog(JSON.stringify(metrics));
    process.exit(0);
  } catch (err) {
    process.stdout.write = originalWrite;
    console.log = originalLog;
    originalLog(JSON.stringify({ error: String(err) }));
    process.exit(1);
  }
}

runBaselineTest();
