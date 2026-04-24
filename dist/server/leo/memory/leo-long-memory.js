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
/** Stub em memória (por tenant). */
const store = new Map();
let idCounter = 0;
function getStore(tenantId) {
    if (!store.has(tenantId))
        store.set(tenantId, []);
    return store.get(tenantId);
}
/**
 * Classe para gerenciamento da memória longa do Leo
 */
export class LeoLongMemory {
    static instance;
    constructor() { }
    static getInstance() {
        if (!LeoLongMemory.instance) {
            LeoLongMemory.instance = new LeoLongMemory();
        }
        return LeoLongMemory.instance;
    }
    async saveMemory(tenantId, input) {
        assertTenantId(tenantId);
        idCounter++;
        const entry = {
            id: idCounter,
            type: input.type,
            content: input.content,
            context: input.context,
            importance: (input.importance || 'medium'),
            createdAt: new Date(),
        };
        getStore(tenantId).unshift(entry);
        return entry;
    }
    async getMemoriesByType(tenantId, type, limit = 50) {
        assertTenantId(tenantId);
        return getStore(tenantId)
            .filter((e) => e.type === type)
            .slice(0, limit);
    }
    async getMemoriesByImportance(tenantId, importance, limit = 50) {
        assertTenantId(tenantId);
        return getStore(tenantId)
            .filter((e) => e.importance === importance)
            .slice(0, limit);
    }
    async getRecentMemories(tenantId, limit = 20) {
        assertTenantId(tenantId);
        return getStore(tenantId).slice(0, limit);
    }
    async searchMemories(tenantId, query, limit = 20) {
        assertTenantId(tenantId);
        const q = query.toLowerCase();
        return getStore(tenantId)
            .filter((e) => e.content.toLowerCase().includes(q))
            .slice(0, limit);
    }
    async saveDecision(tenantId, decision, context, importance = 'medium') {
        return this.saveMemory(tenantId, {
            type: 'decision',
            content: decision,
            context: context || `Decisão tomada em ${new Date().toISOString()}`,
            importance,
        });
    }
    async saveEvent(tenantId, event, context, importance = 'medium') {
        return this.saveMemory(tenantId, {
            type: 'event',
            content: event,
            context: context || `Evento registrado em ${new Date().toISOString()}`,
            importance,
        });
    }
    async saveInsight(tenantId, insight, context, importance = 'high') {
        return this.saveMemory(tenantId, {
            type: 'insight',
            content: insight,
            context: context || `Insight gerado em ${new Date().toISOString()}`,
            importance,
        });
    }
    async savePattern(tenantId, pattern, context, importance = 'high') {
        return this.saveMemory(tenantId, {
            type: 'pattern',
            content: pattern,
            context: context || `Padrão detectado em ${new Date().toISOString()}`,
            importance,
        });
    }
    async saveAlert(tenantId, alert, context, importance = 'critical') {
        return this.saveMemory(tenantId, {
            type: 'alert',
            content: alert,
            context: context || `Alerta gerado em ${new Date().toISOString()}`,
            importance,
        });
    }
    async saveStrategy(tenantId, strategy, context, importance = 'high') {
        return this.saveMemory(tenantId, {
            type: 'strategy',
            content: strategy,
            context: context || `Estratégia aprendida em ${new Date().toISOString()}`,
            importance,
        });
    }
    async getSimilarDecisions(tenantId, _currentContext, limit = 5) {
        return this.getMemoriesByType(tenantId, 'decision', limit);
    }
    async getRecentPatterns(tenantId, _days = 30) {
        return getStore(tenantId).filter((e) => e.type === 'pattern');
    }
    async getCriticalInsights(tenantId, limit = 10) {
        return getStore(tenantId)
            .filter((e) => e.type === 'insight' && e.importance === 'critical')
            .slice(0, limit);
    }
    async getMemoryStats(tenantId) {
        assertTenantId(tenantId);
        ;
        const list = getStore(tenantId);
        const stats = {
            total: list.length,
            events: 0,
            decisions: 0,
            insights: 0,
            patterns: 0,
            alerts: 0,
            strategies: 0,
        };
        for (const e of list) {
            if (e.type in stats)
                stats[e.type]++;
        }
        return stats;
    }
    async cleanupOldMemories(_daysToKeep = 90) {
        return 0;
    }
}
export const leoLongMemory = LeoLongMemory.getInstance();
