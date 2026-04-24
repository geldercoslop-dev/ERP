import { logger, systemLogger } from "./logger.js";
import { getAllCircuitsStatus } from "./circuit-breaker.js";
import { runBackup } from "../infra/backup/backupDb.js";
import { runCleanup } from "../../scripts/cleanup-system.js";
import path from "path";
import fs from "fs";
import { BoundedMap } from "./bounded-map.js";
/**
 * Armazenamento de métricas em memória
 */
const metrics = {
    latencies: new BoundedMap(1000),
    detailedLatencies: new BoundedMap(500), // Para ranking de rotas específicas
    errorCount: 0,
    lastErrorReset: Date.now(),
    repeatedErrors: new BoundedMap(200),
};
/**
 * Configurações do Monitor
 */
const MONITOR_INTERVAL_MS = 30000; // 30 segundos
const ERROR_RESET_INTERVAL_MS = 60000; // 1 minuto
const ERROR_THRESHOLD = 10;
const REPEATED_ERROR_THRESHOLD = 5;
const REPEATED_ERROR_WINDOW = 60000; // 1 minuto
const SLOW_REQUEST_THRESHOLD_MS = 500;
const SLOW_QUERY_THRESHOLD_MS = 300;
const SLOW_OPERATION_THRESHOLD_MS = 200;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
/**
 * Inicia o monitoramento do sistema
 */
export function startSystemMonitor() {
    systemLogger.info({ message: "🚀 Monitor de sistema iniciado" });
    // Loop de monitoramento periódico (30s)
    setInterval(() => {
        logSystemMetrics();
    }, MONITOR_INTERVAL_MS);
    // Loop de health score e reset de erros (1m)
    setInterval(() => {
        const healthScore = calculateHealthScore();
        systemLogger.info({ message: `SYSTEM HEALTH ${healthScore}`, healthScore });
        // Log do ranking de rotas lentas
        logSlowRoutesRanking();
        // Resetar contador de erros a cada minuto
        if (metrics.errorCount >= ERROR_THRESHOLD) {
            systemLogger.warn({ message: "⚠️ ALERTA: Detectada alta taxa de erros no último minuto", errorCount: metrics.errorCount });
        }
        metrics.errorCount = 0;
        metrics.lastErrorReset = Date.now();
    }, ERROR_RESET_INTERVAL_MS);
    // Rotina de Backup Automático e Limpeza (24h)
    setInterval(async () => {
        await performAutoBackup();
        await runCleanup(); // Executar limpeza após o backup
    }, BACKUP_INTERVAL_MS);
}
/**
 * Executa o backup automático do banco de dados
 */
async function performAutoBackup() {
    const backupsDir = path.join(process.cwd(), "backups");
    const startTime = Date.now();
    try {
        systemLogger.info({ message: "📦 Iniciando backup automático de 24h..." });
        const result = await runBackup({ backupsDir, retentionCount: 30 });
        const stats = fs.statSync(path.join(backupsDir, result.file));
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        const duration = Date.now() - startTime;
        systemLogger.info({
            message: `✅ Backup automático concluído: ${result.file} (${sizeMB} MB)`,
            file: result.file,
            sizeMB,
            durationMs: duration
        });
    }
    catch (error) {
        const duration = Date.now() - startTime;
        systemLogger.error({
            message: "❌ BACKUP FAILED",
            durationMs: duration,
            error: error instanceof Error ? error.message : String(error),
            status: "failed"
        });
    }
}
/**
 * Registra o tempo de resposta de uma requisição
 */
export function recordResponseTime(route, durationMs, requestId) {
    // 1. Detectar requisição lenta
    if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
        systemLogger.warn({
            route,
            durationMs,
            requestId,
            threshold: SLOW_REQUEST_THRESHOLD_MS
        }, "🐢 SLOW REQUEST DETECTED");
    }
    // 2. Métrica por categoria (para health score)
    let category = "other";
    if (route.includes("auth"))
        category = "auth";
    else if (route.includes("clientes"))
        category = "clientes";
    else if (route.includes("pedidos"))
        category = "pedidos";
    else if (route.includes("financeiro"))
        category = "financeiro";
    const current = metrics.latencies.get(category) || { count: 0, totalTime: 0, avgTime: 0 };
    current.count++;
    current.totalTime += durationMs;
    current.avgTime = current.totalTime / current.count;
    metrics.latencies.set(category, current);
    // 3. Métrica detalhada por rota (para ranking)
    const detailedKey = route.split('?')[0]; // Remover query params
    const detailed = metrics.detailedLatencies.get(detailedKey) || { count: 0, totalTime: 0, avgTime: 0 };
    detailed.count++;
    detailed.totalTime += durationMs;
    detailed.avgTime = detailed.totalTime / detailed.count;
    metrics.detailedLatencies.set(detailedKey, detailed);
}
/**
 * Registra o tempo de uma query no banco de dados
 */
export function recordQueryTime(service, operation, durationMs) {
    if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
        systemLogger.warn({
            service,
            operation,
            durationMs,
            threshold: SLOW_QUERY_THRESHOLD_MS
        }, "🗄️ SLOW DATABASE QUERY");
    }
}
/**
 * Registra o tempo de uma operação pesada (cálculos, etc)
 */
export function recordOperationTime(name, durationMs) {
    if (durationMs > SLOW_OPERATION_THRESHOLD_MS) {
        systemLogger.warn({
            operation: name,
            durationMs,
            threshold: SLOW_OPERATION_THRESHOLD_MS
        }, "⚡ HEAVY OPERATION DETECTED");
    }
}
/**
 * Loga o ranking das rotas mais lentas
 */
function logSlowRoutesRanking() {
    const ranking = Array.from(metrics.detailedLatencies.entries())
        .map(([route, m]) => ({ route, avgTime: Math.round(m.avgTime), count: m.count }))
        .sort((a, b) => b.avgTime - a.avgTime)
        .slice(0, 5);
    if (ranking.length > 0) {
        systemLogger.info({ ranking }, "📊 TOP SLOW ROUTES (Média ms)");
    }
}
/**
 * Registra a ocorrência de um erro
 */
export function recordError(errorKey) {
    metrics.errorCount++;
    if (errorKey) {
        const now = Date.now();
        const errorData = metrics.repeatedErrors.get(errorKey) || { count: 0, lastSeen: 0 };
        // Se o erro ocorreu fora da janela, resetar contador
        if (now - errorData.lastSeen > REPEATED_ERROR_WINDOW) {
            errorData.count = 1;
        }
        else {
            errorData.count++;
        }
        errorData.lastSeen = now;
        metrics.repeatedErrors.set(errorKey, errorData);
        // Se o erro se repetir muitas vezes, logar alerta
        if (errorData.count === REPEATED_ERROR_THRESHOLD) {
            systemLogger.warn({ errorKey, count: errorData.count }, `⚠️ ERRO REPETIDO DETECTADO: ${errorKey}`);
        }
    }
}
/**
 * Coleta e loga métricas de CPU, Memória e Latência
 */
function logSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    // Memória em MB
    const memoryMB = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
    };
    // Latências médias
    const latencies = {};
    metrics.latencies.forEach((m, key) => {
        latencies[key] = `${m.avgTime.toFixed(2)}ms (${m.count} reqs)`;
    });
    systemLogger.info({
        memoryMB,
        cpuUsage,
        latencies,
        circuits: getAllCircuitsStatus(),
        uptime: Math.round(process.uptime()),
    }, "Métricas de performance do sistema");
}
/**
 * Calcula o Health Score do sistema (0-100)
 */
function calculateHealthScore() {
    let score = 100;
    // 1. Penalidade por erros (cada erro acima do limite tira 5 pontos, max 40)
    if (metrics.errorCount > 0) {
        const errorPenalty = Math.min(metrics.errorCount * 5, 40);
        score -= errorPenalty;
    }
    // 2. Penalidade por latência alta (se média > 500ms, tira 10 pontos; > 1s, tira 20)
    let avgLat = 0;
    let totalReqs = 0;
    metrics.latencies.forEach(m => {
        avgLat += m.totalTime;
        totalReqs += m.count;
    });
    if (totalReqs > 0) {
        const globalAvg = avgLat / totalReqs;
        if (globalAvg > 1000)
            score -= 20;
        else if (globalAvg > 500)
            score -= 10;
    }
    // 3. Penalidade por uso de memória (se heapUsed > 1GB, tira 10 pontos; > 2GB, tira 30)
    const heapUsed = process.memoryUsage().heapUsed / 1024 / 1024;
    if (heapUsed > 2048)
        score -= 30;
    else if (heapUsed > 1024)
        score -= 10;
    // 4. Penalidade por Circuit Breakers abertos (cada um tira 15 pontos)
    const circuits = getAllCircuitsStatus();
    Object.values(circuits).forEach(state => {
        if (state === "OPEN")
            score -= 15;
    });
    return Math.max(0, score);
}
/**
 * Inicia monitoramento de memória do sistema
 * Log periódico de uso de memória para detectar leaks
 */
export function startMemoryMonitoring() {
    const interval = Number(process.env.MEMORY_MONITOR_INTERVAL) || 60000; // 1 minuto padrão
    const alertThreshold = Number(process.env.MEMORY_ALERT_THRESHOLD_MB) || 1024; // 1GB padrão
    if (process.env.MEMORY_MONITOR_ENABLED === 'false') {
        logger.info({ enabled: false }, 'Memory monitor disabled');
        return;
    }
    logger.info({
        interval: interval,
        threshold: alertThreshold
    }, 'Starting system memory monitor');
    setInterval(() => {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);
        // Log detalhado das métricas
        logger.info({
            heap: {
                used: heapUsedMB,
                total: heapTotalMB,
                percentage: Math.round((heapUsedMB / heapTotalMB) * 100)
            },
            rss: rssMB,
            external: Math.round(memUsage.external / 1024 / 1024),
            uptime: Math.round(process.uptime() / 60), // minutos
            timestamp: new Date().toISOString()
        }, 'Memory metrics collected');
        // Alerta de uso alto
        if (heapUsedMB > alertThreshold) {
            logger.warn({
                heapUsed: heapUsedMB,
                threshold: alertThreshold,
                percentage: Math.round((heapUsedMB / heapTotalMB) * 100)
            }, 'High memory usage detected');
        }
        // Detectar possível memory leak (crescimento contínuo)
        const growthRate = calculateMemoryGrowthRate();
        if (growthRate > 0.2) { // Crescimento > 20% indica possível leak
            logger.error({
                growthRate: Math.round(growthRate * 100),
                currentUsage: heapUsedMB,
                samples: 5
            }, 'Potential memory leak detected - investigate immediately');
        }
    }, interval);
}
/**
 * Calcula taxa de crescimento de memória das últimas amostras
 */
function calculateMemoryGrowthRate() {
    const samples = 5;
    const currentUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    // Simples cálculo baseado nas últimas medições (armazenadas no metrics)
    const recentMetrics = Array.from(metrics.latencies.values()).slice(-samples);
    if (recentMetrics.length < 2)
        return 0;
    // Para este exemplo, usamos uma abordagem simplificada
    // Em produção real, você armazenaria o histórico de uso de memória
    const baselineUsage = currentUsage * 0.8; // Assume baseline 80% do atual
    const growthRate = (currentUsage - baselineUsage) / baselineUsage;
    return Math.max(0, growthRate);
}
