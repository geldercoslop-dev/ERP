/**
 * Serviço de Persistência de Memória do LEO
 * Implementação simplificada usando interfaces oficiais
 */

import { LeoMemoryRecord, LeoDecision, ILeoMemory } from '@shared/types';
import { logInfo, logError } from '../../_core/logger-rotation';

// Implementação mínima da interface ILeoMemory
export class LeoMemoryPersistence implements ILeoMemory {
  private static instance: LeoMemoryPersistence;
  private memories: Map<string, LeoMemoryRecord> = new Map();
  private decisions: LeoDecision[] = [];

  private constructor() {}

  public static getInstance(): LeoMemoryPersistence {
    if (!LeoMemoryPersistence.instance) {
      LeoMemoryPersistence.instance = new LeoMemoryPersistence();
    }
    return LeoMemoryPersistence.instance;
  }

  /**
   * Salva uma decisão (interface ILeoMemory)
   */
  async saveDecision(decision: Omit<LeoDecision, 'timestamp'>): Promise<void> {
    try {
      const fullDecision: LeoDecision = {
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
    } catch (error) {
      logError('Erro ao salvar decisão do LEO', error);
      throw error;
    }
  }

  /**
   * Obtém decisões recentes (interface ILeoMemory)
   */
  async getRecentDecisions(limit: number = 50): Promise<LeoDecision[]> {
    try {
      return this.decisions.slice(0, limit);
    } catch (error) {
      logError('Erro ao obter decisões recentes', error);
      return [];
    }
  }

  /**
   * Adiciona decisão (alias para saveDecision)
   */
  async addDecision(decision: Omit<LeoDecision, 'timestamp'>): Promise<void> {
    return this.saveDecision(decision);
  }

  /**
   * Obtém histórico recente (alias para getRecentDecisions)
   */
  async getRecentHistory(limit: number = 50): Promise<LeoDecision[]> {
    return this.getRecentDecisions(limit);
  }

  /**
   * Salva um registro de memória
   */
  async saveMemory(memory: Omit<LeoMemoryRecord, 'timestamp'>): Promise<void> {
    try {
      const fullMemory: LeoMemoryRecord = {
        ...memory,
        timestamp: Date.now()
      };

      this.memories.set(memory.id, fullMemory);

      logInfo('Memória do LEO salva', {
        memoryId: memory.id,
        type: memory.type
      });
    } catch (error) {
      logError('Erro ao salvar memória do LEO', error);
      throw error;
    }
  }

  /**
   * Obtém um registro de memória por ID
   */
  async getMemory(id: string): Promise<LeoMemoryRecord | null> {
    try {
      return this.memories.get(id) || null;
    } catch (error) {
      logError('Erro ao obter memória', error);
      return null;
    }
  }

  /**
   * Busca memórias com filtros
   */
  async searchMemories(filters: {
    type?: string;
    tags?: string[];
    importance?: number[];
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<LeoMemoryRecord[]> {
    try {
      let memories = Array.from(this.memories.values());

      // Filtro por tipo
      if (filters.type) {
        memories = memories.filter((m: any) => m.type === filters.type);
      }

      // Filtro por tags
      if (filters.tags && filters.tags.length > 0) {
        memories = memories.filter((m: any) => 
          filters.tags!.some(tag => m.tags?.includes(tag))
        );
      }

      // Filtro por importância
      if (filters.importance && filters.importance.length > 0) {
        memories = memories.filter((m: any) => 
          filters.importance!.includes(m.importance)
        );
      }

      // Filtro por data
      if (filters.dateFrom) {
        memories = memories.filter((m: any) => m.timestamp >= filters.dateFrom!.getTime());
      }
      if (filters.dateTo) {
        memories = memories.filter((m: any) => m.timestamp <= filters.dateTo!.getTime());
      }

      // Ordenar por timestamp (mais recentes primeiro)
      memories.sort((a, b) => b.timestamp - a.timestamp);

      // Paginação
      const offset = filters.offset || 0;
      const limit = filters.limit || 50;
      memories = memories.slice(offset, offset + limit);

      return memories;
    } catch (error) {
      logError('Erro ao buscar memórias', error);
      return [];
    }
  }

  /**
   * Remove memórias antigas
   */
  async cleanupOldMemories(olderThanDays: number = 30): Promise<number> {
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
      this.decisions = this.decisions.filter((d: any) => d.timestamp >= cutoffTime);
      removedCount += (originalLength - this.decisions.length);

      logInfo('Cleanup de memórias antigas realizado', {
        removedCount,
        olderThanDays
      });

      return removedCount;
    } catch (error) {
      logError('Erro ao limpar memórias antigas', error);
      return 0;
    }
  }

  /**
   * Obtém estatísticas da memória
   */
  async getStats(): Promise<{
    totalMemories: number;
    totalDecisions: number;
    memoriesByType: Record<string, number>;
    recentDecisions: number;
  }> {
    try {
      const memories = Array.from(this.memories.values());
      const memoriesByType: Record<string, number> = {};

      memories.forEach(memory => {
        memoriesByType[memory.type] = (memoriesByType[memory.type] || 0) + 1;
      });

      const recentDecisions = this.decisions.filter(
        d => Date.now() - d.timestamp < 24 * 60 * 60 * 1000
      ).length;

      return {
        totalMemories: this.memories.size,
        totalDecisions: this.decisions.length,
        memoriesByType,
        recentDecisions
      };
    } catch (error) {
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
