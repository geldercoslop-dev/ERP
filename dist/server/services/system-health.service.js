import { getDb } from '../db/index.js';
import { systemLogger } from '../_core/logger.js';
import { redisManager } from '../infra/redis.js';
import { getErrorMessage } from '../utils/safe-error.js';
import { parseEnv } from './env.schema.js';
const REDIS_HEALTH_TIMEOUT_MS = 2000;
function withTimeout(promise, ms, label) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId !== undefined)
            clearTimeout(timeoutId);
    });
}
const SERVER_START_TIME = Date.now();
/** Reduz tempestade de SELECT/PING quando muitos clientes chamam /health/full em paralelo (0 = desliga cache). */
const HEALTH_FULL_CACHE_MS_RAW = Number(process.env.HEALTH_FULL_CACHE_MS);
const HEALTH_FULL_CACHE_MS = Number.isFinite(HEALTH_FULL_CACHE_MS_RAW) && HEALTH_FULL_CACHE_MS_RAW >= 0
    ? HEALTH_FULL_CACHE_MS_RAW
    : 2000;
let fullHealthInflight = null;
let fullHealthCache = null;
/**
 * Verifica conexão com banco de dados
 */
async function checkDatabaseHealth() {
    const startTime = Date.now();
    console.log("[HEALTH-DB] PASSO 1: Iniciando checkDatabaseHealth");
    try {
        console.log("[HEALTH-DB] PASSO 2: Chamando getDb()");
        const db = await getDb();
        if (!db) {
            console.log("[HEALTH-DB] ERRO: getDb() retornou null/undefined");
            return {
                status: 'error',
                responseTime: Date.now() - startTime,
                error: 'Database connection not available'
            };
        }
        console.log("[HEALTH-DB] PASSO 3: Executando query SELECT 1");
        // Testar query simples
        await db.execute('SELECT 1 as test');
        const responseTime = Date.now() - startTime;
        console.log("[HEALTH-DB] PASSO 4: Query executada com sucesso", { responseTime });
        // Verificar se response time está aceitável
        if (responseTime > 5000) { // 5 segundos
            console.log("[HEALTH-DB] AVISO: Response time muito alto", { responseTime });
            return {
                status: 'slow',
                responseTime,
                error: `Database response time too high: ${responseTime}ms`
            };
        }
        console.log("[HEALTH-DB] PASSO 5: Database check concluído com sucesso");
        return {
            status: 'ok',
            responseTime
        };
    }
    catch (error) {
        console.error("[HEALTH-DB] ERRO: Falha no checkDatabaseHealth", {
            error: getErrorMessage(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        return {
            status: 'error',
            responseTime: Date.now() - startTime,
            error: getErrorMessage(error)
        };
    }
}
async function checkRedisHealth() {
    const startTime = Date.now();
    console.log("[HEALTH-REDIS] PASSO 1: Iniciando checkRedisHealth");
    try {
        console.log("[HEALTH-REDIS] PASSO 2: Chamando withTimeout redisManager.isConnected()");
        const ok = await withTimeout(redisManager.isConnected(), REDIS_HEALTH_TIMEOUT_MS, 'Redis health check');
        const responseTime = Date.now() - startTime;
        console.log("[HEALTH-REDIS] PASSO 3: Redis isConnected concluído", { ok, responseTime });
        if (!ok) {
            console.log("[HEALTH-REDIS] ERRO: Redis não respondeu ao PING");
            return {
                status: 'error',
                responseTime,
                error: 'Redis não respondeu ao PING',
            };
        }
        console.log("[HEALTH-REDIS] PASSO 4: Redis check concluído com sucesso");
        return { status: 'ok', responseTime };
    }
    catch (error) {
        console.error("[HEALTH-REDIS] ERRO: Falha no checkRedisHealth", {
            error: getErrorMessage(error),
            stack: error instanceof Error ? error.stack : undefined,
            responseTime: Date.now() - startTime
        });
        return {
            status: 'error',
            responseTime: Date.now() - startTime,
            error: getErrorMessage(error),
        };
    }
}
/**
 * Formata uptime para exibição
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}
/** Resposta consistente quando o health check falha de forma inesperada */
export function buildSystemHealthFailureResponse(error) {
    const message = getErrorMessage(error);
    return {
        status: 'error',
        timestamp: new Date().toISOString(),
        responseTime: 0,
        server: {
            status: 'error',
            uptime: Date.now() - SERVER_START_TIME,
            uptimeFormatted: formatUptime(Date.now() - SERVER_START_TIME),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            environment: process.env.NODE_ENV || 'development',
            isProduction: false,
        },
        database: {
            status: 'error',
            responseTime: 0,
            error: message,
        },
        redis: {
            status: 'error',
            responseTime: 0,
            error: 'Indisponível',
        },
        memory: {
            rss: 0,
            heapTotal: 0,
            heapUsed: 0,
            external: 0,
        },
        environment: {
            DATABASE_URL: false,
            DB_HOST: false,
            DB_NAME: false,
            PORT: false,
        },
        allEnvironmentOk: false,
        version: {
            app: '1.0.0',
            api: 'v1',
            build: new Date().toISOString().split('T')[0],
        },
    };
}
/**
 * Verifica variáveis de ambiente essenciais
 */
function checkEnvironment() {
    const envChecks = {
        DATABASE_URL: (() => {
            try {
                void parseEnv();
                return true;
            }
            catch {
                return false;
            }
        })(),
        DB_HOST: !!process.env.DB_HOST,
        DB_NAME: !!process.env.DB_NAME,
        PORT: !!process.env.PORT
    };
    const allEnvOk = Object.values(envChecks).every(Boolean);
    return { envChecks, allEnvOk };
}
export function getSystemHealthLight() {
    const startTime = Date.now();
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - SERVER_START_TIME;
    return {
        status: 'ok',
        checks: 'light',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        uptime,
        uptimeFormatted: formatUptime(uptime),
        memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
        },
    };
}
async function computeSystemHealthComplete() {
    const startTime = Date.now();
    console.log("[HEALTH-COMPUTE] PASSO 1: Iniciando computeSystemHealthComplete");
    try {
        console.log("[HEALTH-COMPUTE] PASSO 2: Iniciando Promise.all de database e redis");
        const [databaseHealth, redisHealth] = await Promise.all([
            checkDatabaseHealth(),
            checkRedisHealth(),
        ]);
        console.log("[HEALTH-COMPUTE] PASSO 3: Concluído checks de DB e Redis", {
            dbStatus: databaseHealth.status,
            redisStatus: redisHealth.status
        });
        const memUsage = process.memoryUsage();
        const memUsageMB = {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
        };
        const uptime = Date.now() - SERVER_START_TIME;
        const nodeEnv = process.env.NODE_ENV || "development";
        const isProduction = nodeEnv === "production";
        const { envChecks, allEnvOk } = checkEnvironment();
        const serverStatus = databaseHealth.status === "ok" && allEnvOk ? "ok" : "error";
        console.log("[HEALTH-COMPUTE] PASSO 4: Montando resposta final");
        const healthData = {
            status: serverStatus,
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime,
            server: {
                status: serverStatus,
                uptime,
                uptimeFormatted: formatUptime(uptime),
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                environment: nodeEnv,
                isProduction,
            },
            database: databaseHealth,
            redis: redisHealth,
            memory: memUsageMB,
            environment: envChecks,
            allEnvironmentOk: allEnvOk,
            version: {
                app: "1.0.0",
                api: "v1",
                build: new Date().toISOString().split("T")[0],
            },
        };
        console.log("[HEALTH-COMPUTE] PASSO 5: Retornando healthData com sucesso");
        return healthData;
    }
    catch (error) {
        console.error("[HEALTH-COMPUTE] ERRO: Falha em computeSystemHealthComplete", {
            error: getErrorMessage(error),
            stack: error instanceof Error ? error.stack : undefined,
            duration: Date.now() - startTime
        });
        systemLogger.error({
            error: getErrorMessage(error),
            duration: Date.now() - startTime,
        }, "System health check failed");
        const payload = buildSystemHealthFailureResponse(error);
        console.log("[HEALTH-COMPUTE] PASSO 6: Retornando payload de falha");
        return {
            ...payload,
            responseTime: Date.now() - startTime,
        };
    }
}
/**
 * Saúde completa (DB + Redis). Coalesce de requisições paralelas + TTL curto para não martelar o pool.
 */
export async function getSystemHealthComplete() {
    console.log("[HEALTH-SERVICE] PASSO A: Iniciando getSystemHealthComplete");
    if (HEALTH_FULL_CACHE_MS === 0) {
        console.log("[HEALTH-SERVICE] PASSO B: Cache desabilitado, chamando compute direto");
        return computeSystemHealthComplete();
    }
    const now = Date.now();
    if (fullHealthCache && now < fullHealthCache.until) {
        console.log("[HEALTH-SERVICE] PASSO C: Retornando do cache");
        return {
            ...fullHealthCache.data,
            timestamp: new Date().toISOString(),
            responseTime: 0,
        };
    }
    if (!fullHealthInflight) {
        console.log("[HEALTH-SERVICE] PASSO D: Criando nova requisição computeSystemHealthComplete");
    }
    else {
        console.log("[HEALTH-SERVICE] PASSO D: Usando requisição existente em andamento");
    }
    fullHealthInflight ??= computeSystemHealthComplete()
        .then((data) => {
        console.log("[HEALTH-SERVICE] PASSO E: computeSystemHealthComplete concluído com sucesso");
        fullHealthCache = { data, until: Date.now() + HEALTH_FULL_CACHE_MS };
        return data;
    })
        .finally(() => {
        console.log("[HEALTH-SERVICE] PASSO F: Limpando fullHealthInflight");
        fullHealthInflight = null;
    });
    return fullHealthInflight;
}
/**
 * Função legada para compatibilidade
 */
export function getSystemHealth() {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    let score = 100;
    if (memory.heapUsed > 500_000_000)
        score -= 20;
    if (uptime < 5)
        score -= 10;
    let status = 'ok';
    if (score < 90)
        status = 'warning';
    if (score < 70)
        status = 'critical';
    return {
        status,
        score,
        details: {
            uptime,
            memory,
            env: process.env.NODE_ENV || 'unknown'
        }
    };
}
