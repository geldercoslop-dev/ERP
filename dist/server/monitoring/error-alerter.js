/**
 * Sistema de Alertas para Erros Repetidos
 *
 * Monitora erros e emite alertas quando detecta padrões repetidos
 */
import { createLogger } from '../infra/structured-logger.js';
const logger = createLogger('error-alerter');
class ErrorAlerter {
    static instance;
    errorMap = new Map();
    MAX_ERRORS = 1000;
    MAX_CONTEXTS = 10;
    ALERT_THRESHOLD = 5; // Número de ocorrências para alertar
    TIME_WINDOW = 5 * 60 * 1000; // 5 minutos em ms
    constructor() {
        // Singleton
        this.startCleanupInterval();
    }
    static getInstance() {
        if (!ErrorAlerter.instance) {
            ErrorAlerter.instance = new ErrorAlerter();
        }
        return ErrorAlerter.instance;
    }
    /**
     * Registra um erro e verifica se deve emitir alerta
     */
    trackError(message, context) {
        const now = new Date();
        const errorKey = this.normalizeErrorMessage(message);
        // Obter ou criar entrada de erro
        let entry = this.errorMap.get(errorKey);
        if (!entry) {
            entry = {
                message,
                count: 0,
                firstSeen: now,
                lastSeen: now,
                occurrences: [],
                contexts: []
            };
            this.errorMap.set(errorKey, entry);
        }
        // Atualizar estatísticas
        entry.count++;
        entry.lastSeen = now;
        entry.occurrences.push(now);
        // Limitar o número de contextos armazenados
        if (context && entry.contexts.length < this.MAX_CONTEXTS) {
            entry.contexts.push(context);
        }
        // Verificar se deve emitir alerta
        this.checkForAlert(errorKey, entry);
        // Limitar o tamanho do mapa
        if (this.errorMap.size > this.MAX_ERRORS) {
            this.pruneOldErrors();
        }
    }
    /**
     * Verifica se deve emitir alerta para o erro
     */
    checkForAlert(errorKey, entry) {
        const recentOccurrences = this.getRecentOccurrences(entry);
        if (recentOccurrences.length >= this.ALERT_THRESHOLD) {
            // Verificar se já emitimos alerta recentemente para este erro
            const lastAlertTime = entry.lastAlertTime;
            const now = new Date();
            // Emitir alerta no máximo a cada 15 minutos para o mesmo erro
            if (!lastAlertTime || (now.getTime() - lastAlertTime.getTime() > 15 * 60 * 1000)) {
                this.emitAlert(errorKey, entry, recentOccurrences.length);
                entry.lastAlertTime = now;
            }
        }
    }
    /**
     * Emite alerta para erro repetido
     */
    emitAlert(errorKey, entry, recentCount) {
        logger.error(`ALERTA: Erro repetido detectado ${recentCount} vezes nos últimos 5 minutos`, {
            errorKey,
            message: entry.message,
            totalCount: entry.count,
            recentCount,
            firstSeen: entry.firstSeen.toISOString(),
            lastSeen: entry.lastSeen.toISOString(),
            metadata: {
                contexts: entry.contexts.slice(0, 3),
                alert: true,
                criticalError: recentCount >= 10
            }
        });
        // Se for um erro muito frequente, emitir alerta crítico
        if (recentCount >= 10) {
            this.emitCriticalAlert(entry, recentCount);
        }
    }
    /**
     * Emite alerta crítico para erros muito frequentes
     */
    emitCriticalAlert(entry, recentCount) {
        // Aqui você poderia integrar com sistemas externos de alerta
        // como Slack, PagerDuty, SMS, etc.
        logger.error(`ALERTA CRÍTICO: Erro detectado ${recentCount} vezes nos últimos 5 minutos`, {
            message: entry.message,
            count: entry.count,
            metadata: {
                criticalAlert: true,
                contexts: entry.contexts.slice(0, 3)
            }
        });
    }
    /**
     * Obtém ocorrências recentes de um erro
     */
    getRecentOccurrences(entry) {
        const cutoff = new Date(Date.now() - this.TIME_WINDOW);
        return entry.occurrences.filter(date => date >= cutoff);
    }
    /**
     * Normaliza a mensagem de erro para agrupar erros similares
     */
    normalizeErrorMessage(message) {
        // Remover IDs, timestamps, etc para agrupar erros similares
        return message
            .replace(/\b[0-9a-f]{8,}\b/gi, '[ID]') // IDs hexadecimais
            .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/g, '[TIMESTAMP]') // ISO timestamps
            .replace(/\b\d+\b/g, '[NUMBER]') // Números
            .replace(/(['"]).*?\1/g, '$1[STRING]$1') // Strings entre aspas
            .trim();
    }
    /**
     * Remove erros antigos para limitar o uso de memória
     */
    pruneOldErrors() {
        // Ordenar por última ocorrência
        const entries = Array.from(this.errorMap.entries())
            .sort((a, b) => a[1].lastSeen.getTime() - b[1].lastSeen.getTime());
        // Remover os 20% mais antigos
        const removeCount = Math.max(1, Math.floor(this.errorMap.size * 0.2));
        for (let i = 0; i < removeCount; i++) {
            if (entries[i]) {
                this.errorMap.delete(entries[i][0]);
            }
        }
    }
    /**
     * Inicia limpeza periódica de erros antigos
     */
    startCleanupInterval() {
        // Limpar erros a cada hora
        setInterval(() => {
            const now = Date.now();
            const cutoff = new Date(now - 24 * 60 * 60 * 1000); // 24 horas
            for (const [key, entry] of this.errorMap.entries()) {
                // Limpar ocorrências antigas
                entry.occurrences = entry.occurrences.filter(date => date >= cutoff);
                // Remover entradas sem ocorrências recentes
                if (entry.occurrences.length === 0) {
                    this.errorMap.delete(key);
                }
            }
        }, 60 * 60 * 1000); // 1 hora
    }
    /**
     * Obtém estatísticas de erros para monitoramento
     */
    getErrorStats() {
        const now = Date.now();
        const recentCutoff = new Date(now - this.TIME_WINDOW);
        let recentErrors = 0;
        const errorStats = Array.from(this.errorMap.values()).map(entry => {
            const recentCount = entry.occurrences.filter(date => date >= recentCutoff).length;
            recentErrors += recentCount;
            return {
                message: entry.message,
                count: entry.count,
                recentCount
            };
        });
        // Ordenar por ocorrências recentes
        const topErrors = errorStats
            .sort((a, b) => b.recentCount - a.recentCount)
            .slice(0, 10);
        return {
            total: this.errorMap.size,
            recentErrors,
            topErrors
        };
    }
}
// Exportar singleton
export const errorAlerter = ErrorAlerter.getInstance();
// Função de conveniência para registrar erros
export function trackError(error, context) {
    const message = error instanceof Error ? error.message : error;
    errorAlerter.trackError(message, {
        ...(context || {}),
        stack: error instanceof Error ? error.stack : undefined
    });
}
export default errorAlerter;
