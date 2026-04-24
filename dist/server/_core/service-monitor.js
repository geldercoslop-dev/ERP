/**
 * Monitor global para serviços
 *
 * Este módulo fornece um monitor global para rastrear erros e alertar
 * sobre problemas críticos nos serviços.
 */
import { getErrorStats, resetErrorStats, logInfo, logWarning, logCritical } from './service-logger.js';
import { getInvalidReturnCount } from './service-protection.js';
/**
 * Intervalo de verificação do monitor (em ms)
 */
const MONITOR_CHECK_INTERVAL = 60000; // 1 minuto
/**
 * Limite de erros por minuto para considerar um problema crítico
 */
const CRITICAL_ERROR_THRESHOLD = 10;
/**
 * Flag para indicar se o monitor está ativo
 */
let isMonitorActive = false;
/**
 * ID do intervalo do monitor
 */
let monitorIntervalId = null;
/**
 * Histórico de alertas críticos
 */
const criticalAlerts = [];
/**
 * Verifica o estado do sistema e alerta sobre problemas críticos
 */
function checkSystemHealth() {
    const { totalErrors, errorsByType, errorsLastMinute } = getErrorStats();
    const invalidReturnCount = getInvalidReturnCount();
    // Registrar estatísticas de saúde do sistema
    logInfo('Verificação de saúde do sistema', {
        payload: {
            totalErrors,
            errorsByType,
            errorsLastMinute,
            invalidReturnCount
        }
    });
    // Verificar se há problemas críticos
    if (errorsLastMinute >= CRITICAL_ERROR_THRESHOLD) {
        const message = `CRITICAL SYSTEM ISSUE: ${errorsLastMinute} errors in the last minute`;
        logCritical('CRITICAL_SYSTEM_ISSUE', message, {
            payload: {
                errorsByType,
                invalidReturnCount
            }
        });
        // Registrar alerta crítico
        criticalAlerts.push({
            timestamp: new Date(),
            errorCount: errorsLastMinute,
            invalidReturnCount,
            message
        });
        // Resetar estatísticas de erro após registrar o alerta
        resetErrorStats();
    }
}
/**
 * Inicia o monitor global
 */
export function startServiceMonitor() {
    if (isMonitorActive) {
        logWarning('MONITOR_ALREADY_ACTIVE', 'Monitor de serviços já está ativo');
        return;
    }
    logInfo('Iniciando monitor de serviços');
    // Iniciar verificação periódica
    monitorIntervalId = setInterval(checkSystemHealth, MONITOR_CHECK_INTERVAL);
    isMonitorActive = true;
}
/**
 * Para o monitor global
 */
export function stopServiceMonitor() {
    if (!isMonitorActive) {
        logWarning('MONITOR_NOT_ACTIVE', 'Monitor de serviços não está ativo');
        return;
    }
    logInfo('Parando monitor de serviços');
    // Parar verificação periódica
    if (monitorIntervalId !== null) {
        clearInterval(monitorIntervalId);
        monitorIntervalId = null;
    }
    isMonitorActive = false;
}
/**
 * Obtém o estado atual do monitor
 * @returns O estado atual do monitor
 */
export function getMonitorStatus() {
    return {
        isActive: isMonitorActive,
        criticalAlerts: [...criticalAlerts],
        errorStats: getErrorStats(),
        invalidReturnCount: getInvalidReturnCount()
    };
}
/**
 * Limpa o histórico de alertas críticos
 */
export function clearCriticalAlerts() {
    criticalAlerts.length = 0;
    logInfo('Histórico de alertas críticos limpo');
}
