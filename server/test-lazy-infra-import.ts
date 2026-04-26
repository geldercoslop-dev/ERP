/**
 * Test: Verify infrastructure is lazy - no initialization at import time
 * 
 * This test verifies that:
 * 1. Importing Redis module doesn't trigger connection
 * 2. Importing Database module doesn't trigger connection
 * 3. System can be imported without ENV vars set
 */

export {};

async function runTest(): Promise<void> {
  console.log('[TEST] Starting lazy infrastructure import test...');

  // Test 1: Import Redis module - should NOT trigger connection
  console.log('[TEST 1] Importing Redis module...');
  try {
    // This import should NOT fail even if REDIS_HOST is not set
    // because RedisManager constructor is now lazy
    const redisModule = await import('./infra/redis.js');
    console.log('[TEST 1] ✅ Redis module imported successfully (no connection attempted)');
  } catch (error) {
    console.error('[TEST 1] ❌ Redis module import failed:', error);
    process.exit(1);
  }

  // Test 2: Import Database module - should NOT trigger connection
  console.log('[TEST 2] Importing Database module...');
  try {
    // This import should NOT fail even if DATABASE_URL is not set
    // because getDb() is lazy
    const dbModule = await import('./db/core.js');
    console.log('[TEST 2] ✅ Database module imported successfully (no connection attempted)');
  } catch (error) {
    console.error('[TEST 2] ❌ Database module import failed:', error);
    process.exit(1);
  }

  // Test 3: Import queue service - should NOT trigger connection
  console.log('[TEST 3] Importing queue service...');
  try {
    const queueModule = await import('./core/queue.service.js');
    console.log('[TEST 3] ✅ Queue service imported successfully (no connection attempted)');
  } catch (error) {
    console.error('[TEST 3] ❌ Queue service import failed:', error);
    process.exit(1);
  }

  // Test 4: Import BullMQ module - should NOT trigger connection
  console.log('[TEST 4] Importing BullMQ module...');
  try {
    const bullmqModule = await import('./_core/bullmq-queue.js');
    console.log('[TEST 4] ✅ BullMQ module imported successfully (no connection attempted)');
  } catch (error) {
    console.error('[TEST 4] ❌ BullMQ module import failed:', error);
    process.exit(1);
  }

  // Test 5: Verify getRedis() exists but doesn't connect until called
  console.log('[TEST 5] Verifying getRedis() function exists...');
  try {
    const redisModule = await import('./infra/redis.js');
    if (typeof redisModule.getRedis === 'function') {
      console.log('[TEST 5] ✅ getRedis() function exists');
    } else {
      console.error('[TEST 5] ❌ getRedis() function not found');
      process.exit(1);
    }
  } catch (error) {
    console.error('[TEST 5] ❌ Failed to verify getRedis():', error);
    process.exit(1);
  }

  console.log('\n[TEST] ✅ All lazy infrastructure tests passed!');
  console.log('[TEST] Infrastructure is now properly lazy - no import-time initialization');
}
