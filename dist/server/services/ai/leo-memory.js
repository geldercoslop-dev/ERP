/**
 * LEO Memory - Gerenciador de contexto da conversa do assistente.
 *
 * Suporta sessionContext, recentEntities e lastAction para continuidade de conversa
 * (ex.: "quem é esse cliente?", "quanto ele está devendo?").
 */
import { logger } from "../../utils/logger.js";
const MAX_HISTORY = 10;
const MAX_SESSION_TURNS = 5;
const MAX_RECENT_ENTITIES_ENTRIES = 5;
class LeoMemory {
    static instance;
    memoryCache = new Map();
    constructor() { }
    static getInstance() {
        if (!LeoMemory.instance) {
            LeoMemory.instance = new LeoMemory();
        }
        return LeoMemory.instance;
    }
    /**
     * Adiciona uma interação à memória do usuário.
     */
    record(usuario, pergunta, resposta, entidades, ultimaAcao, tenantId) {
        const entry = {
            id: Math.random().toString(36).substring(2, 11),
            usuario,
            pergunta,
            resposta,
            timestamp: new Date(),
            entidades,
            ultimaAcao,
            tenantId,
        };
        const history = this.memoryCache.get(usuario) || [];
        history.push(entry);
        if (history.length > MAX_HISTORY)
            history.shift();
        this.memoryCache.set(usuario, history);
        logger.debug({ message: "Memória do LEO atualizada", usuario, entries: history.length });
    }
    /**
     * Obtém o histórico recente do usuário.
     */
    getHistory(usuario) {
        return this.memoryCache.get(usuario) || [];
    }
    /**
     * Obtém o último contexto (entidades e ação) do usuário.
     */
    getLastContext(usuario) {
        const history = this.getHistory(usuario);
        if (history.length === 0)
            return null;
        return history[history.length - 1];
    }
    /**
     * Contexto de sessão: últimas N perguntas/respostas para continuidade de conversa.
     */
    getSessionContext(usuario, maxTurns = MAX_SESSION_TURNS) {
        const history = this.getHistory(usuario);
        const turns = history
            .slice(-maxTurns)
            .map((e) => ({
            pergunta: e.pergunta,
            resposta: e.resposta,
            timestamp: e.timestamp.toISOString(),
        }));
        return { turns };
    }
    /**
     * Entidades recentes (últimas N entradas com entidades) para referência anafórica.
     */
    getRecentEntities(usuario, maxEntries = MAX_RECENT_ENTITIES_ENTRIES) {
        const history = this.getHistory(usuario);
        const out = {};
        const withEntities = history.filter((e) => e.entidades && Object.keys(e.entidades).length > 0).slice(-maxEntries);
        for (const e of withEntities) {
            if (e.entidades)
                Object.assign(out, e.entidades);
        }
        return out;
    }
    /**
     * Última ação executada (nome da tool/intent) para o usuário.
     */
    getLastAction(usuario) {
        const last = this.getLastContext(usuario);
        return last?.ultimaAcao ?? null;
    }
    /**
     * Limpa a memória do usuário.
     */
    clear(usuario) {
        this.memoryCache.delete(usuario);
        logger.info({ message: "Memória do LEO limpa", usuario });
    }
}
export const leoMemory = LeoMemory.getInstance();
