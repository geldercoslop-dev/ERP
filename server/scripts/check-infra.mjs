#!/usr/bin/env node

/**
 * check-infra - Verifica disponibilidade de infraestrutura
 * 
 * Valida:
 * - Database (MySQL) conectado
 * - Redis conectado
 */

import { createConnection } from 'mysql2/promise';
import Redis from 'ioredis';
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.production") });
console.log("DB:", process.env.DATABASE_URL ? "OK" : "MISSING");

const results = [];
const DB_MAX_LATENCY_MS = Number(process.env.CHECK_INFRA_DB_MAX_MS || 5000);
const REDIS_MAX_LATENCY_MS = Number(process.env.CHECK_INFRA_REDIS_MAX_MS || 5000);

function checkSecretLength(name, minLength = 64) {
  const value = process.env[name];
  if (!value || value.trim().length < minLength) {
    return {
      name,
      success: false,
      message: `❌ ${name} inválido`,
      error: `tamanho mínimo exigido: ${minLength}`,
    };
  }
  return {
    name,
    success: true,
    message: `✅ ${name} válido`,
  };
}

async function checkDatabase() {
  const startTime = Date.now();
  const dbUrl = process.env.DATABASE_URL || process.env.DB_URL;

  if (!dbUrl) {
    return {
      name: 'DATABASE',
      success: false,
      message: '❌ DATABASE_URL não configurado',
      error: 'ENV ausente',
    };
  }

  try {
    const regex = /^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
    const match = dbUrl.match(regex);

    if (!match) {
      return {
        name: 'DATABASE',
        success: false,
        message: '❌ DATABASE_URL mal formatado',
        error: 'Esperado: mysql://user:pass@host:port/db',
      };
    }

    const [, user, password, host, port, database] = match;
    const connection = await createConnection({
      host,
      port: parseInt(port),
      user,
      password,
      database,
      connectionLimit: 1,
    });

    const latency = Date.now() - startTime;
    await connection.ping();
    await connection.end();

    return {
      name: 'DATABASE',
      success: true,
      message: `✅ MySQL conectado (${host}:${port}/${database})`,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    const err = error instanceof Error ? error.message : String(error);
    return {
      name: 'DATABASE',
      success: false,
      message: '❌ Falha ao conectar',
      error: err,
      latency,
    };
  }
}

async function checkRedis() {
  const startTime = Date.now();
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');
  const redisPassword = process.env.REDIS_PASSWORD;

  try {
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      retryStrategy: () => null,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        redis.disconnect();
        resolve({
          name: 'REDIS',
          success: false,
          message: '❌ Redis timeout',
          error: 'Não respondeu em 5s',
        });
      }, 5000);

      redis.on('error', (err) => {
        clearTimeout(timeout);
        redis.disconnect();
        const errMsg = err instanceof Error ? err.message : String(err);
        resolve({
          name: 'REDIS',
          success: false,
          message: '❌ Falha ao conectar',
          error: errMsg,
        });
      });

      redis.on('ready', async () => {
        clearTimeout(timeout);
        try {
          const latency = Date.now() - startTime;
          await redis.ping();
          await redis.quit();
          resolve({
            name: 'REDIS',
            success: true,
            message: `✅ Redis conectado (${redisHost}:${redisPort})`,
            latency,
          });
        } catch (err) {
          redis.disconnect();
          const errMsg = err instanceof Error ? err.message : String(err);
          resolve({
            name: 'REDIS',
            success: false,
            message: '❌ Falha ao testar',
            error: errMsg,
          });
        }
      });
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      name: 'REDIS',
      success: false,
      message: '❌ Falha ao conectar',
      error: errMsg,
    };
  }
}

async function runChecks() {
  console.log('\n🔍 Verificando infraestrutura...\n');
  const secretChecks = [
    checkSecretLength("JWT_ACCESS_SECRET"),
    checkSecretLength("JWT_REFRESH_SECRET"),
    checkSecretLength("APP_SECRET"),
  ];
  const [dbResult, redisResult] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  if (dbResult.success && typeof dbResult.latency === "number" && dbResult.latency > DB_MAX_LATENCY_MS) {
    dbResult.success = false;
    dbResult.message = "❌ DB latency acima do limite";
    dbResult.error = `latência ${dbResult.latency}ms > ${DB_MAX_LATENCY_MS}ms`;
  }

  if (redisResult.success && typeof redisResult.latency === "number" && redisResult.latency > REDIS_MAX_LATENCY_MS) {
    redisResult.success = false;
    redisResult.message = "❌ Redis latency acima do limite";
    redisResult.error = `latência ${redisResult.latency}ms > ${REDIS_MAX_LATENCY_MS}ms`;
  }

  results.push(...secretChecks, dbResult, redisResult);

  for (const result of results) {
    console.log(`${result.message}`);
    if (result.latency) {
      console.log(`   ⏱️  ${result.latency}ms`);
    }
    if (result.error) {
      console.log(`   📍 ${result.error}`);
    }
  }

  console.log();
  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('✅ Infraestrutura OK!\n');
    process.exit(0);
  } else {
    console.log('❌ Boot abortado.\n');
    process.exit(1);
  }
}

runChecks().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
