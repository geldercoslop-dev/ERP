/**
 * Memória Longa do LEO
 *
 * Sistema de memória persistente para armazenar:
 * - Decisões importantes
 * - Eventos críticos
 * - Padrões detectados
 * - Insights gerados
 * - Estratégias aprendidas
 *
 * Stub: leoMemory em schema-leo-memory é pg e sem tenantId; backend principal usa MySQL.
 * Usa armazenamento em memória até migração para tabela MySQL compatível.
 */

import { assertTenantId } from "../../_core/errors/assertions.js";

export type MemoryType = 'event' | 'decision' | 'insight' | 'pattern' | 'alert' | 'strategy';
export type MemoryImportance = 'low' | 'medium' | 'high' | 'critical';

export interface LeoMemoryEntry {
  id?: number;
  type: MemoryType;
  content: string;
  context?: string;
  importance: MemoryImportance;
  createdAt?: Date;
}

export interface CreateMemoryInput {
  type: MemoryType;
  content: string;
  context?: string;
  importance?: MemoryImportance;
}

/** Stub em memória (por tenant). */
const store = new Map<number, LeoMemoryEntry[]>();
let idCounter = 0;

function getStore(tenantId: number): LeoMemoryEntry[] {
  if (!store.has(tenantId)) store.set(tenantId, []);
  return store.get(tenantId)!;
}

/**
 * Classe para gerenciamento da memória longa do Leo
 */
export class LeoLongMemory {
  private static instance: LeoLongMemory;

  private constructor() {}

  public static getInstance(): LeoLongMemory {
    if (!LeoLongMemory.instance) {
      LeoLongMemory.instance = new LeoLongMemory();
    }
    return LeoLongMemory.instance;
  }

  async saveMemory(tenantId: number, input: CreateMemoryInput): Promise<LeoMemoryEntry> {
    assertTenantId(tenantId);
    idCounter++;
    const entry: LeoMemoryEntry = {
      id: idCounter,
      type: input.type,
      content: input.content,
      context: input.context,
      importance: (input.importance || 'medium') as MemoryImportance,
      createdAt: new Date(),
    };
    getStore(tenantId).unshift(entry);
    return entry;
  }

  async getMemoriesByType(tenantId: number, type: MemoryType, limit: number = 50): Promise<LeoMemoryEntry[]> {
    assertTenantId(tenantId);
    return getStore(tenantId)
      .filter((e) => e.type === type)
      .slice(0, limit);
  }

  async getMemoriesByImportance(tenantId: number, importance: MemoryImportance, limit: number = 50): Promise<LeoMemoryEntry[]> {
    assertTenantId(tenantId);
    return getStore(tenantId)
      .filter((e) => e.importance === importance)
      .slice(0, limit);
  }

  async getRecentMemories(tenantId: number, limit: number = 20): Promise<LeoMemoryEntry[]> {
    assertTenantId(tenantId);
    return getStore(tenantId).slice(0, limit);
  }

  async searchMemories(tenantId: number, query: string, limit: number = 20): Promise<LeoMemoryEntry[]> {
    assertTenantId(tenantId);
    const q = query.toLowerCase();
    return getStore(tenantId)
      .filter((e) => e.content.toLowerCase().includes(q))
      .slice(0, limit);
  }

  async saveDecision(tenantId: number, decision: string, context?: string, importance: MemoryImportance = 'medium'): Promise<LeoMemoryEntry> {
    return this.saveMemory(tenantId, {
      type: 'decision',
      content: decision,
      context: context || `Decisão tomada em ${new Date().toISOString()}`,
      importance,
    });
  }

  async saveEvent(tenantId: number, event: string, context?: string, importance: MemoryImportance = 'medium'): Promise<LeoMemoryEntry> {
    return this.saveMemory(tenantId, {
      type: 'event',
      content: event,
      context: context || `Evento registrado em ${new Date().toISOString()}`,
      importance,
    });
  }

  async saveInsight(tenantId: number, insight: string, context?: string, importance: MemoryImportance = 'high'): Promise<LeoMemoryEntry> {
    return this.saveMemory(tenantId, {
      type: 'insight',
      content: insight,
      context: context || `Insight gerado em ${new Date().toISOString()}`,
      importance,
    });
  }

  async savePattern(tenantId: number, pattern: string, context?: string, importance: MemoryImportance = 'high'): Promise<LeoMemoryEntry> {
    return this.saveMemory(tenantId, {
      type: 'pattern',
      content: pattern,
      context: context || `Padrão detectado em ${new Date().toISOString()}`,
      importance,
    });
  }

  async saveAlert(tenantId: number, alert: string, context?: string, importance: MemoryImportance = 'critical'): Promise<LeoMemoryEntry> {
    return this.saveMemory(tenantId, {
      type: 'alert',
      content: alert,
      context: context || `Alerta gerado em ${new Date().toISOString()}`,
      importance,
    });
  }

  async saveStrategy(tenantId: number, strategy: string, context?: string, importance: MemoryImportance = 'high'): Promise<LeoMemoryEntry> {
    return this.saveMemory(tenantId, {
      type: 'strategy',
      content: strategy,
      context: context || `Estratégia aprendida em ${new Date().toISOString()}`,
      importance,
    });
  }

  async getSimilarDecisions(tenantId: number, _currentContext: string, limit: number = 5): Promise<LeoMemoryEntry[]> {
    return this.getMemoriesByType(tenantId, 'decision', limit);
  }

  async getRecentPatterns(tenantId: number, _days: number = 30): Promise<LeoMemoryEntry[]> {
    return getStore(tenantId).filter((e) => e.type === 'pattern');
  }

  async getCriticalInsights(tenantId: number, limit: number = 10): Promise<LeoMemoryEntry[]> {
    return getStore(tenantId)
      .filter((e) => e.type === 'insight' && e.importance === 'critical')
      .slice(0, limit);
  }

  async getMemoryStats(tenantId: number): Promise<Record<string, unknown>> {
    assertTenantId(tenantId);;
    const list = getStore(tenantId);
    const stats: Record<string, number> = {
      total: list.length,
      events: 0,
      decisions: 0,
      insights: 0,
      patterns: 0,
      alerts: 0,
      strategies: 0,
    };
    for (const e of list) {
      if (e.type in stats) stats[e.type]++;
    }
    return stats as Record<string, unknown>;
  }

  async cleanupOldMemories(_daysToKeep: number = 90): Promise<number> {
    return 0;
  }
}

export const leoLongMemory = LeoLongMemory.getInstance();
