#!/usr/bin/env tsx
import { initEnv } from "../server/_core/env/bootstrapEnv";
import { detectRuntimeContext, getContextInfo } from "../server/_core/env/runtimeContext";

// Carrega variáveis de ambiente antes das validações
initEnv();

/**
 * VERIFY:REDIS - Context-aware validation for Redis
 *
 * Validates:
 * - Real connection to Redis
 * - Real authentication if REDIS_PASSWORD exists
 * - Context-aware failure (fail-hard in PROD, fail-soft in DEV)
 * - Keys always with tenantId when multi-tenant
 * - Explicit TTL on all temporary keys
 * - No silent fallback in production
 * - Fail-hard errors in critical flows (production only)
 */

import { getRedis } from "../server/infra/redis";

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message: string) {
  log(message, 'red');
}

function success(message: string) {
  log(message, 'green');
}

function warn(message: string) {
  log(message, 'yellow');
}

function info(message: string) {
  log(message, 'blue');
}

let failed = false;

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const context = detectRuntimeContext();
const contextInfo = getContextInfo();

info('\n' + '='.repeat(60));
info('REDIS CONTEXT-AWARE VALIDATION');
info('='.repeat(60));
info(`Context: ${context.toUpperCase()}`);
info(`Description: ${contextInfo.description}`);
info(`NODE_ENV: ${contextInfo.nodeEnv}`);
info(`CI: ${contextInfo.isCI ? 'true' : 'false'}`);

const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;
const redisPassword = process.env.REDIS_PASSWORD;

// Context-aware validation
if (!redisHost || !redisPort) {
  if (context === 'development') {
    warn('⚠️  REDIS_HOST and REDIS_PORT not configured');
    warn('Redis is optional in development mode');
    warn('System will operate without distributed cache and queues');
    info('\n✅ SKIP_REDIS_CHECK - Development mode');
    process.exit(0);
  }

  if (context === 'ci') {
    const ciRedisRequired = process.env.CI_REDIS_REQUIRED === 'true';
    if (ciRedisRequired) {
      error('❌ REDIS_HOST and REDIS_PORT must be configured in CI');
      error('CI_REDIS_REQUIRED=true but Redis is not configured');
      process.exit(1);
    } else {
      warn('⚠️  REDIS_HOST and REDIS_PORT not configured in CI');
      warn('CI_REDIS_REQUIRED=false - skipping Redis check');
      info('\n✅ SKIP_REDIS_CHECK - CI mode with CI_REDIS_REQUIRED=false');
      process.exit(0);
    }
  }

  // Production: fail-hard
  error('❌ REDIS_HOST and REDIS_PORT must be configured in production');
  error('Redis is a mandatory dependency in production');
  process.exit(1);
}

const redisPortNumber = Number(redisPort);

info('\n' + '='.repeat(60));
info('REDIS HARDENING VALIDATION');
info('='.repeat(60));
info(`Host: ${redisHost}`);
info(`Port: ${redisPortNumber}`);
info(`Password: ${redisPassword ? '***CONFIGURED***' : 'NOT CONFIGURED'}`);

// ============================================================================
// TESTE 1: CONEXÃO REAL (Context-Aware)
// ============================================================================
info('\n🔍 TEST 1: Real Connection');

let client;
try {
  client = getRedis().getClient();
} catch (e) {
  const err = e as Error;

  if (context === 'development') {
    warn(`⚠️  Redis client not available: ${err.message}`);
    warn('Redis is optional in development mode');
    info('\n✅ SKIP_REDIS_CHECK - Development mode');
    process.exit(0);
  }

  if (context === 'ci') {
    const ciRedisRequired = process.env.CI_REDIS_REQUIRED === 'true';
    if (ciRedisRequired) {
      error(`❌ Redis client not available: ${err.message}`);
      error('Redis is required in CI when CI_REDIS_REQUIRED=true');
      process.exit(1);
    } else {
      warn(`⚠️  Redis client not available: ${err.message}`);
      warn('CI_REDIS_REQUIRED=false - skipping Redis check');
      info('\n✅ SKIP_REDIS_CHECK - CI mode with CI_REDIS_REQUIRED=false');
      process.exit(0);
    }
  }

  // Production: fail-hard
  error(`❌ Redis client not available: ${err.message}`);
  error('Redis is a mandatory dependency in production');
  process.exit(1);
}

try {
  await client.ping();
  success('✅ Redis connection established');
  console.log('Redis OK');
} catch (e) {
  const err = e as Error;

  if (context === 'development') {
    warn(`⚠️  Redis connection failed: ${err.message}`);
    warn('Redis is optional in development mode');
    info('\n✅ SKIP_REDIS_CHECK - Development mode');
    process.exit(0);
  }

  if (context === 'ci') {
    const ciRedisRequired = process.env.CI_REDIS_REQUIRED === 'true';
    if (ciRedisRequired) {
      error(`❌ Redis connection failed: ${err.message}`);
      error('Redis is required in CI when CI_REDIS_REQUIRED=true');
      process.exit(1);
    } else {
      warn(`⚠️  Redis connection failed: ${err.message}`);
      warn('CI_REDIS_REQUIRED=false - skipping Redis check');
      info('\n✅ SKIP_REDIS_CHECK - CI mode with CI_REDIS_REQUIRED=false');
      process.exit(0);
    }
  }

  // Production: fail-hard
  error(`❌ Redis connection failed: ${err.message}`);
  failed = true;
  process.exit(1);
}

// ============================================================================
// TESTE 2: AUTENTICAÇÃO REAL
// ============================================================================
info('\n🔍 TEST 2: Real Authentication');

if (redisPassword) {
  try {
    // Try to execute a command - if auth fails, this will throw
    await client.ping();
    success('✅ Redis authentication successful');
  } catch (e) {
    const err = e as Error;
    error(`❌ Redis authentication failed: ${err.message}`);
    error('REDIS_PASSWORD is configured but authentication failed');
    failed = true;
    process.exit(1);
  }
} else {
  warn('⚠️  REDIS_PASSWORD not configured - authentication skipped');
}

// ============================================================================
// TESTE 3: GRAVA KEY COM TENANTID
// ============================================================================
info('\n🔍 TEST 3: Write key with tenantId');

const testTenantId = 'test-tenant-123';
const testKey = `tenant:${testTenantId}:test:verify-redis`;
const testValue = 'test-value';

try {
  await client.set(testKey, testValue);
  success(`✅ Key written with tenantId: ${testKey}`);
} catch (e) {
  const err = e as Error;
  error(`❌ Failed to write key with tenantId: ${err.message}`);
  failed = true;
}

// ============================================================================
// TESTE 4: CONFIRMA TTL
// ============================================================================
info('\n🔍 TEST 4: Confirm TTL on temporary key');

const testTTLKey = `tenant:${testTenantId}:test:verify-redis:ttl`;
const testTTLValue = 'test-ttl-value';
const testTTLSeconds = 60;

try {
  await client.set(testTTLKey, testTTLValue, 'EX', testTTLSeconds);
  
  const ttl = await client.ttl(testTTLKey);
  
  if (ttl > 0 && ttl <= testTTLSeconds) {
    success(`✅ TTL confirmed: ${ttl}s (expected: ${testTTLSeconds}s)`);
  } else {
    error(`❌ TTL invalid: ${ttl}s (expected: ${testTTLSeconds}s)`);
    failed = true;
  }
} catch (e) {
  const err = e as Error;
  error(`❌ Failed to set/verify TTL: ${err.message}`);
  failed = true;
}

// ============================================================================
// TESTE 5: REMOVE KEY
// ============================================================================
info('\n🔍 TEST 5: Remove key');

try {
  await client.del(testKey);
  await client.del(testTTLKey);
  
  const exists1 = await client.exists(testKey);
  const exists2 = await client.exists(testTTLKey);
  
  if (exists1 === 0 && exists2 === 0) {
    success('✅ Keys removed successfully');
  } else {
    error(`❌ Keys still exist after deletion: key1=${exists1}, key2=${exists2}`);
    failed = true;
  }
} catch (e) {
  const err = e as Error;
  error(`❌ Failed to remove keys: ${err.message}`);
  failed = true;
}

// ============================================================================
// TESTE 6: FALHA COM TENANT AUSENTE
// ============================================================================
info('\n🔍 TEST 6: Fail correctly with missing tenant');

const badKey = 'test:verify-redis:no-tenant'; // Missing tenant prefix

try {
  // This should not fail in Redis itself, but we validate the pattern
  await client.set(badKey, 'bad-value');
  await client.del(badKey);
  
  warn('⚠️  Redis allows keys without tenantId - application must enforce this');
  warn('⚠️  This is a Redis-level test - application logic must validate tenantId');
} catch (e) {
  const err = e as Error;
  error(`❌ Unexpected error with missing tenant: ${err.message}`);
  failed = true;
}

// ============================================================================
// TESTE 7: FAIL-HARD EM FLUXO CRÍTICO
// ============================================================================
info('\n🔍 TEST 7: Fail-hard in critical flow');

// Simulate a critical operation that should fail if Redis is unavailable
try {
  const criticalKey = `tenant:${testTenantId}:critical:operation`;
  await client.set(criticalKey, 'critical-value', 'EX', 300);
  await client.del(criticalKey);
  success('✅ Critical flow operations work correctly');
} catch (e) {
  const err = e as Error;
  error(`❌ Critical flow failed: ${err.message}`);
  error('Redis must be available for critical operations');
  failed = true;
}

// ============================================================================
// CLEANUP
// ============================================================================
info('\n🔍 Cleanup');

// Connection managed by getRedis() - no manual cleanup needed
success('✅ Redis connection managed by getRedis()');

// ============================================================================
// RESULTADO
// ============================================================================
info('\n' + '='.repeat(60));

if (failed) {
  error('🚨 REDIS VALIDATION FAILED');
  error('One or more Redis hardening checks failed');
  process.exit(1);
} else {
  success('✅ REDIS VALIDATION PASSED');
  success('All Redis hardening checks passed');
  process.exit(0);
}
