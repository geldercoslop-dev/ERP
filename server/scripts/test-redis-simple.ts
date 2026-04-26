import { initEnv } from '../_core/env/bootstrapEnv.js';
import { Redis } from 'ioredis';

// Bootstrap ENV antes de qualquer acesso ao Redis
initEnv();

console.log('🔥 Starting Redis Runtime Test...\n');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => {
  console.error('❌ Redis Error:', err.message);
  process.exit(1);
});

redis.on('connect', async () => {
  console.log('✅ Connected to Redis');
  
  try {
    // TEST 1: PING
    console.log('\n--- Basic Tests ---');
    const ping = await redis.ping();
    console.log(`✅ PING: ${ping}`);

    // TEST 2: SET/GET
    await redis.set('test', 'value123');
    const val = await redis.get('test');
    console.log(`✅ SET/GET: ${val}`);

    // TEST 3: HSET/HGET
    await redis.hset('testhash', 'field', 'hashvalue');
    const hval = await redis.hget('testhash', 'field');
    console.log(`✅ HSET/HGET: ${hval}`);

    // TEST 4: LPUSH/LRANGE
    await redis.lpush('testlist', 'item1', 'item2');
    const items = await redis.lrange('testlist', 0, -1);
    console.log(`✅ LPUSH/LRANGE: [${items.join(', ')}]`);

    // TEST 5: SADD/SMEMBERS
    await redis.sadd('testset', 'member1', 'member2');
    const members = await redis.smembers('testset');
    console.log(`✅ SADD/SMEMBERS: [${members.join(', ')}]`);

    // TEST 6: DEL
    const deleted = await redis.del('test', 'testhash', 'testlist', 'testset');
    console.log(`✅ DEL: ${deleted} keys deleted`);

    console.log('\n✅ ALL REDIS TESTS PASSED - RUNTIME IS REAL!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test Error:', error);
    process.exit(1);
  }
});
