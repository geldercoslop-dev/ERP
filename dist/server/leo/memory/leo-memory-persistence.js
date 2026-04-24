/**
 * Serviço de Persistência de Memória do LEO
 * Implementação simplificada usando interfaces oficiais
 */
import { logInfo, logError } from '../../_core/logger-rotation.js';
// Implementação mínima da interface ILeoMemory
export class LeoMemoryPersistence {
    static instance;
    memories = new Map();
    decisions = [];
    constructor() { }
    static getInstance() {
        if (!LeoMemoryPersistence.instance) {
            LeoMemoryPersistence.instance = new LeoMemoryPersistence();
        }
        return LeoMemoryPersistence.instance;
    }
    /**
     * Salva uma decisão (interface ILeoMemory)
     */
    async saveDecision(decision) {
        try {
            const fullDecision = {
                ...decision,
                timestamp: Date.now()
            };
            this.decisions.unshift(fullDecision);
            // Manter apenas as 1000 decisões mais recentes
            if (this.decisions.length > 1000) {
                this.decisions = this.decisions.slice(0, 1000);
            }
            logInfo('Decisão do LEO salva', {
                decisionId: decision.id,
                action: decision.action
            });
        }
        catch (error) {
            logError('Erro ao salvar decisão do LEO', error);
            throw error;
        }
    }
    /**
     * Obtém decisões recentes (interface ILeoMemory)
     */
    async getRecentDecisions(limit = 50) {
        try {
            return this.decisions.slice(0, limit);
        }
        catch (error) {
            logError('Erro ao obter decisões recentes', error);
            return [];
        }
    }
    /**
     * Adiciona decisão (alias para saveDecision)
     */
    async addDecision(decision) {
        return this.saveDecision(decision);
    }
    /**
     * Obtém histórico recente (alias para getRecentDecisions)
     */
    async getRecentHistory(limit = 50) {
        return this.getRecentDecisions(limit);
    }
    /**
     * Salva um registro de memória
     */
    async saveMemory(memory) {
        try {
            const fullMemory = {
                ...memory,
                timestamp: Date.now()
            };
            this.memories.set(memory.id, fullMemory);
            logInfo('Memória do LEO salva', {
                memoryId: memory.id,
                type: memory.type
            });
        }
        catch (error) {
            logError('Erro ao salvar memória do LEO', error);
            throw error;
        }
    }
    /**
     * Obtém um registro de memória por ID
     */
    async getMemory(id) {
        try {
            return this.memories.get(id) || null;
        }
        catch (error) {
            logError('Erro ao obter memória', error);
            return null;
        }
    }
    /**
     * Busca memórias com filtros
     */
    async searchMemories(filters) {
        try {
            let memories = Array.from(this.memories.values());
            // Filtro por tipo
            if (filters.type) {
                memories = memories.filter((m) => m.type === filters.type);
            }
            // Filtro por tags
            if (filters.tags && filters.tags.length > 0) {
                memories = memories.filter((m) => filters.tags.some(tag => m.tags?.includes(tag)));
            }
            // Filtro por importância
            if (filters.importance && filters.importance.length > 0) {
                memories = memories.filter((m) => filters.importance.includes(m.importance));
            }
            // Filtro por data
            if (filters.dateFrom) {
                memories = memories.filter((m) => m.timestamp >= filters.dateFrom.getTime());
            }
            if (filters.dateTo) {
                memories = memories.filter((m) => m.timestamp <= filters.dateTo.getTime());
            }
            // Ordenar por timestamp (mais recentes primeiro)
            memories.sort((a, b) => b.timestamp - a.timestamp);
            // Paginação
            const offset = filters.offset || 0;
            const limit = filters.limit || 50;
            memories = memories.slice(offset, offset + limit);
            return memories;
        }
        catch (error) {
            logError('Erro ao buscar memórias', error);
            return [];
        }
    }
    /**
     * Remove memórias antigas
     */
    async cleanupOldMemories(olderThanDays = 30) {
        try {
            const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
            let removedCount = 0;
            for (const [id, memory] of Array.from(this.memories.entries())) {
                if (memory.timestamp < cutoffTime) {
                    this.memories.delete(id);
                    removedCount++;
                }
            }
            // Limpar decisões antigas também
            const originalLength = this.decisions.length;
            this.decisions = this.decisions.filter((d) => d.timestamp >= cutoffTime);
            removedCount += (originalLength - this.decisions.length);
            logInfo('Cleanup de memórias antigas realizado', {
                removedCount,
                olderThanDays
            });
            return removedCount;
        }
        catch (error) {
            logError('Erro ao limpar memórias antigas', error);
            return 0;
        }
    }
    /**
     * Obtém estatísticas da memória
     */
    async getStats() {
        try {
            const memories = Array.from(this.memories.values());
            const memoriesByType = {};
            memories.forEach(memory => {
                memoriesByType[memory.type] = (memoriesByType[memory.type] || 0) + 1;
            });
            const recentDecisions = this.decisions.filter(d => Date.now() - d.timestamp < 24 * 60 * 60 * 1000).length;
            return {
                totalMemories: this.memories.size,
                totalDecisions: this.decisions.length,
                memoriesByType,
                recentDecisions
            };
        }
        catch (error) {
            logError('Erro ao obter estatísticas da memória', error);
            return {
                totalMemories: 0,
                totalDecisions: 0,
                memoriesByType: {},
                recentDecisions: 0
            };
        }
    }
}
// Exportar instância singleton
export const leoMemoryPersistence = LeoMemoryPersistence.getInstance();
