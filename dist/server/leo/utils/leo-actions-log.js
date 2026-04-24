/**
 * LEO Actions Logger
 *
 * Sistema de logging para auditoria de ações do agente
 */
import { leoLogManager } from './leo-log-manager.js';
export class LeoActionsLog {
    /**
     * Registra execução de ferramenta
     */
    static async logAction(entry) {
        await leoLogManager.writeLog({
            level: entry.result === 'error' ? 'ERROR' : 'INFO',
            module: 'LEO_AGENT_ACTIONS',
            message: `Tool execution: ${entry.toolName} - ${entry.result}`,
            data: {
                toolName: entry.toolName,
                executionTime: entry.executionTime,
                result: entry.result,
                errorMessage: entry.errorMessage,
                tenantId: entry.tenantId,
                userId: entry.userId,
                vendedorId: entry.vendedorId,
                input: this.sanitizeInput(entry.input),
                output: this.sanitizeOutput(entry.output),
                metadata: entry.metadata
            },
            timestamp: entry.timestamp
        });
    }
    /**
     * Registra múltiplas ações em batch
     */
    static async logBatchActions(entries) {
        for (const entry of entries) {
            await this.logAction(entry);
        }
    }
    /**
     * Busca ações por filtros
     */
    static async searchActions(filters) {
        // Implementação futura com banco de dados
        // Por enquanto, retorna array vazio
        return [];
    }
    /**
     * Obtém estatísticas de uso
     */
    static async getUsageStats(tenantId, period = 'today') {
        // Implementação futura com banco de dados
        return {
            totalActions: 0,
            successRate: 0,
            mostUsedTools: [],
            averageExecutionTime: 0
        };
    }
    /**
     * Limpa dados sensíveis do input para logging
     */
    static sanitizeInput(input) {
        if (!input)
            return { empty: true, sanitized: null };
        if (typeof input === 'string') {
            // Remove senhas e dados sensíveis
            return input.replace(/password["\s*:=]["\s*][^\\s]*/gi, 'password:***');
        }
        if (typeof input === 'object' && input !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(input)) {
                if (key.toLowerCase().includes('password') ||
                    key.toLowerCase().includes('senha') ||
                    key.toLowerCase().includes('token') ||
                    key.toLowerCase().includes('secret')) {
                    sanitized[key] = '***';
                }
                else {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        }
        return input;
    }
    /**
     * Limpa dados sensíveis do output para logging
     */
    static sanitizeOutput(output) {
        if (!output)
            return { empty: true, sanitized: null };
        if (typeof output === 'string') {
            // Remove informações pessoais
            return output.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, 'XXX.XXX.XXX-XX');
        }
        if (typeof output === 'object' && output !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(output)) {
                if (key.toLowerCase().includes('cpf') ||
                    key.toLowerCase().includes('cnpj') ||
                    key.toLowerCase().includes('telefone')) {
                    if (typeof value === 'string') {
                        sanitized[key] = this.maskSensitiveData(value);
                    }
                    else {
                        sanitized[key] = '***';
                    }
                }
                else {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        }
        return output;
    }
    /**
     * Mascara dados sensíveis
     */
    static maskSensitiveData(data) {
        if (data.length <= 4)
            return '***';
        return data.substring(0, 2) + '***' + data.substring(data.length - 2);
    }
    /**
     * Gera relatório de auditoria
     */
    static async generateAuditReport(tenantId, filters) {
        // Implementação futura
        return {
            totalActions: 0,
            errorRate: 0,
            topTools: [],
            securityAlerts: []
        };
    }
}
