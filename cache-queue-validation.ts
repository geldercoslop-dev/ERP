import 'dotenv/config';
import { getCache, setCache } from './server/core/cache.service.js';
import { enqueue, process } from './server/core/queue.service.js';

interface CacheTestResult {
  hits: number;
  misses: number;
  errors: number;
  tenantIsolation: boolean;
}

interface QueueTestResult {
  jobsEnqueued: number;
  jobsProcessed: number;
  payloadIntegrity: boolean;
  errors: number;
}

async function testCacheUnderLoad(): Promise<CacheTestResult> {
  console.log('\n=== TESTE DE CACHE SOB CARGA ===');
  
  let hits = 0;
  let misses = 0;
  let errors = 0;
  let tenantIsolationViolations = 0;
  
  const tenants = Array.from({ length: 100 }, (_, i) => i + 1);
  const testKey = 'test-key';
  const testValue = 'test-value';
  
  // Phase 1: Set cache for all tenants
  console.log('Phase 1: Setting cache for 100 tenants...');
  const setPromises = tenants.map(async (tenantId) => {
    try {
      await setCache(tenantId, testKey, `${testValue}-${tenantId}`, 300); // 5 minutes TTL
    } catch (error) {
      errors++;
    }
  });
  
  await Promise.all(setPromises);
  console.log(`Cache set for ${tenants.length} tenants`);
  
  // Phase 2: Read cache multiple times per tenant
  console.log('Phase 2: Reading cache (1000 reads per tenant)...');
  const readPromises: Promise<void>[] = [];
  
  tenants.forEach((tenantId) => {
    for (let i = 0; i < 1000; i++) {
      readPromises.push(
        (async () => {
          try {
            const value = await getCache<string>(tenantId, testKey);
            if (value) {
              hits++;
              // Validate tenant isolation
              if (value !== `${testValue}-${tenantId}`) {
                tenantIsolationViolations++;
              }
            } else {
              misses++;
            }
          } catch (error) {
            errors++;
          }
        })()
      );
    }
  });
  
  await Promise.all(readPromises);
  
  console.log(`Cache Results: ${hits} hits, ${misses} misses, ${errors} errors`);
  console.log(`Tenant Isolation Violations: ${tenantIsolationViolations}`);
  
  return {
    hits,
    misses,
    errors,
    tenantIsolation: tenantIsolationViolations === 0
  };
}

async function testQueueUnderLoad(): Promise<QueueTestResult> {
  console.log('\n=== TESTE DE QUEUE SOB CARGA ===');
  
  let jobsEnqueued = 0;
  let jobsProcessed = 0;
  let payloadErrors = 0;
  let processingErrors = 0;
  
  const tenants = Array.from({ length: 100 }, (_, i) => i + 1);
  const jobType = 'test-job';
  
  // Setup worker
  console.log('Setting up queue worker...');
  const worker = process(jobType, async (job) => {
    try {
      const jobData = job.data as any;
      const { tenantId, traceId, data } = jobData;
      
      // Validate payload structure
      if (!tenantId || !traceId || !data) {
        payloadErrors++;
        return;
      }
      
      // Validate payload integrity
      if (data.tenantId !== tenantId || data.traceId !== traceId) {
        payloadErrors++;
        return;
      }
      
      jobsProcessed++;
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      
    } catch (error) {
      processingErrors++;
    }
  });
  
  // Phase 1: Enqueue jobs for all tenants
  console.log('Phase 1: Enqueuing jobs (10 per tenant)...');
  const enqueuePromises = tenants.map(async (tenantId) => {
    for (let i = 0; i < 10; i++) {
      try {
        const traceId = `trace-${tenantId}-${i}`;
        const payload = {
          tenantId,
          traceId,
          data: {
            tenantId,
            traceId,
            timestamp: Date.now(),
            index: i
          }
        };
        
        await enqueue(jobType, payload);
        jobsEnqueued++;
        
      } catch (error) {
        processingErrors++;
      }
    }
  });
  
  await Promise.all(enqueuePromises);
  console.log(`Enqueued ${jobsEnqueued} jobs`);
  
  // Wait for processing
  console.log('Phase 2: Waiting for job processing...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Close worker
  await worker.close();
  
  console.log(`Queue Results: ${jobsEnqueued} enqueued, ${jobsProcessed} processed, ${payloadErrors} payload errors, ${processingErrors} processing errors`);
  
  return {
    jobsEnqueued,
    jobsProcessed,
    payloadIntegrity: payloadErrors === 0,
    errors: payloadErrors + processingErrors
  };
}

async function main(): Promise<void> {
  console.log('=== VALIDAÇÃO DE CACHE + QUEUE SOB CARGA ===');
  
  try {
    // Test Cache
    const cacheResult = await testCacheUnderLoad();
    
    // Test Queue
    const queueResult = await testQueueUnderLoad();
    
    // Analysis
    console.log('\n=== ANÁLISE FINAL ===');
    
    console.log('\nCACHE:');
    console.log(`- Hit Rate: ${((cacheResult.hits / (cacheResult.hits + cacheResult.misses)) * 100).toFixed(2)}%`);
    console.log(`- Errors: ${cacheResult.errors}`);
    console.log(`- Tenant Isolation: ${cacheResult.tenantIsolation ? 'PASS' : 'FAIL'}`);
    
    console.log('\nQUEUE:');
    console.log(`- Jobs Enqueued: ${queueResult.jobsEnqueued}`);
    console.log(`- Jobs Processed: ${queueResult.jobsProcessed}`);
    console.log(`- Processing Rate: ${((queueResult.jobsProcessed / queueResult.jobsEnqueued) * 100).toFixed(2)}%`);
    console.log(`- Payload Integrity: ${queueResult.payloadIntegrity ? 'PASS' : 'FAIL'}`);
    console.log(`- Errors: ${queueResult.errors}`);
    
    // Validation Criteria
    const cachePass = cacheResult.errors === 0 && cacheResult.tenantIsolation;
    const queuePass = queueResult.errors === 0 && queueResult.payloadIntegrity && queueResult.jobsProcessed === queueResult.jobsEnqueued;
    
    console.log('\n=== VALIDAÇÃO DE CRITÉRIOS ===');
    console.log(`Cache: ${cachePass ? 'PASS' : 'FAIL'}`);
    console.log(`Queue: ${queuePass ? 'PASS' : 'FAIL'}`);
    console.log(`Overall: ${cachePass && queuePass ? 'PASS' : 'FAIL'}`);
    
  } catch (error) {
    console.error('ERRO NA VALIDAÇÃO:', error);
  }
}

main().catch(console.error);
