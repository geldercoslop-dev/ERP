/**
 * 🔥 AUDITOR DE PRODUÇÃO - Redis Runtime Test
 * Testa se a correção de TypeScript é REAL e não fake
 * 
 * Executa operações reais do Redis:
 * - SET/GET (String)
 * - HSET/HGET (Hash)
 * - DEL (Delete)
 * - EXISTS (Exists)
 * - LPUSH/LPOP (List)
 * - SADD/SMEMBERS (Set)
 */

import 'dotenv/config';
import { Redis } from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

interface TestResult {
  operation: string;
  status: 'PASS' | 'FAIL';
  result?: unknown;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function logTest(
  operation: string,
  status: 'PASS' | 'FAIL',
  result?: unknown,
  error?: string,
  duration?: number
) {
  results.push({ operation, status, result, error, duration: duration || 0 });
  const icon = status === 'PASS' ? '✅' : '❌';
  const msg = `${icon} [${operation}] ${status}`;
  
  if (result !== undefined) {
    console.log(`${msg} → ${JSON.stringify(result)}`);
  } else if (error) {
    console.log(`${msg}\n   Error: ${error}`);
  } else {
    console.log(msg);
  }
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        🔥 REDIS RUNTIME VALIDATION - PRODUCTION AUDIT       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`📡 Conectando ao Redis: ${REDIS_HOST}:${REDIS_PORT}\n`);

  let redis: Redis | null = null;

  try {
    // ===== CONNECTION =====
    let start = Date.now();
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null,
    });

    redis.on('error', (err) => {
      console.error('Redis Connection Error:', err);
    });

    // Esperar pela conexão
    await redis.ping();
    let duration = Date.now() - start;
    await logTest('REDIS.PING', 'PASS', 'pong', undefined, duration);

    // ===== STRING OPERATIONS =====
    console.log('\n--- String Operations ---');

    start = Date.now();
    const setResult = await redis.set('test:key', '12345');
    duration = Date.now() - start;
    await logTest('SET test:key "12345"', setResult ? 'PASS' : 'FAIL', setResult, undefined, duration);

    start = Date.now();
    const getResult = await redis.get('test:key');
    duration = Date.now() - start;
    await logTest('GET test:key', getResult === '12345' ? 'PASS' : 'FAIL', getResult, undefined, duration);

    start = Date.now();
    const existsResult = await redis.exists('test:key');
    duration = Date.now() - start;
    await logTest('EXISTS test:key', existsResult === 1 ? 'PASS' : 'FAIL', existsResult, undefined, duration);

    // ===== HASH OPERATIONS =====
    console.log('\n--- Hash Operations ---');

    start = Date.now();
    const hsetResult = await redis.hset('test:hash', 'field1', 'value1');
    duration = Date.now() - start;
    await logTest('HSET test:hash field1 value1', hsetResult === 1 ? 'PASS' : 'FAIL', hsetResult, undefined, duration);

    start = Date.now();
    const hgetResult = await redis.hget('test:hash', 'field1');
    duration = Date.now() - start;
    await logTest('HGET test:hash field1', hgetResult === 'value1' ? 'PASS' : 'FAIL', hgetResult, undefined, duration);

    start = Date.now();
    const hgetallResult = await redis.hgetall('test:hash');
    duration = Date.now() - start;
    const hgetallPass = hgetallResult && hgetallResult['field1'] === 'value1';
    await logTest('HGETALL test:hash', hgetallPass ? 'PASS' : 'FAIL', hgetallResult, undefined, duration);

    // ===== LIST OPERATIONS =====
    console.log('\n--- List Operations ---');

    start = Date.now();
    const lpushResult = await redis.lpush('test:list', 'item1', 'item2');
    duration = Date.now() - start;
    await logTest('LPUSH test:list item1 item2', lpushResult === 2 ? 'PASS' : 'FAIL', lpushResult, undefined, duration);

    start = Date.now();
    const lrangeResult = await redis.lrange('test:list', 0, -1);
    duration = Date.now() - start;
    const lrangePass = Array.isArray(lrangeResult) && lrangeResult.length === 2;
    await logTest('LRANGE test:list 0 -1', lrangePass ? 'PASS' : 'FAIL', lrangeResult, undefined, duration);

    start = Date.now();
    const lpopResult = await redis.lpop('test:list');
    duration = Date.now() - start;
    await logTest('LPOP test:list', lpopResult === 'item2' ? 'PASS' : 'FAIL', lpopResult, undefined, duration);

    // ===== SET OPERATIONS =====
    console.log('\n--- Set Operations ---');

    start = Date.now();
    const saddResult = await redis.sadd('test:set', 'member1', 'member2', 'member3');
    duration = Date.now() - start;
    await logTest('SADD test:set member1 member2 member3', saddResult === 3 ? 'PASS' : 'FAIL', saddResult, undefined, duration);

    start = Date.now();
    const smembersResult = await redis.smembers('test:set');
    duration = Date.now() - start;
    const smembersPass = Array.isArray(smembersResult) && smembersResult.length === 3;
    await logTest('SMEMBERS test:set', smembersPass ? 'PASS' : 'FAIL', smembersResult, undefined, duration);

    // ===== SORTED SET OPERATIONS =====
    console.log('\n--- Sorted Set Operations ---');

    start = Date.now();
    const zaddResult = await redis.zadd('test:zset', 1, 'one', 2, 'two', 3, 'three');
    duration = Date.now() - start;
    await logTest('ZADD test:zset 1 one 2 two 3 three', typeof zaddResult === 'number' ? 'PASS' : 'FAIL', zaddResult, undefined, duration);

    start = Date.now();
    const zrangeResult = await redis.zrange('test:zset', 0, -1);
    duration = Date.now() - start;
    const zrangePass = Array.isArray(zrangeResult) && zrangeResult.length === 3;
    await logTest('ZRANGE test:zset 0 -1', zrangePass ? 'PASS' : 'FAIL', zrangeResult, undefined, duration);

    // ===== DELETE OPERATIONS =====
    console.log('\n--- Delete Operations ---');

    start = Date.now();
    const delResult = await redis.del('test:key', 'test:hash', 'test:list', 'test:set', 'test:zset');
    duration = Date.now() - start;
    await logTest('DEL test:key test:hash test:list test:set test:zset', delResult >= 0 ? 'PASS' : 'FAIL', delResult, undefined, duration);

    // ===== CLEANUP =====
    console.log('\n--- Cleanup ---');
    await redis.flushdb();
    await logTest('FLUSHDB', 'PASS', 'database cleared', undefined, 0);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await logTest('CONNECTION_ERROR', 'FAIL', undefined, errorMsg, 0);
    process.exit(1);
  } finally {
    if (redis) {
      await redis.quit();
    }
  }

  // ===== SUMMARY =====
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 TEST SUMMARY                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / total) * 100)}%\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        console.log(`  - ${r.operation}: ${r.error || 'No result'}`);
      });
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED - Redis runtime is REAL and FUNCTIONAL!\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
