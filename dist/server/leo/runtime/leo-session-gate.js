/**
 * Fila serializada por sessão LEO — 1 ação ativa por contexto; demais aguardam na fila.
 * Evita corrida entre tools, memória e LLM no mesmo usuário/aba.
 */
let globalStats = { enqueued: 0, completed: 0, failed: 0 };
/**
 * Monta chave estável: tenant + usuário (ou sessionId explícito do cliente).
 */
export function buildLeoSessionKey(tenantId, userId, explicitSessionId, fallbackLabel = "anon") {
    const sid = explicitSessionId?.trim();
    if (sid) {
        return `leo:${tenantId}:sess:${sid.slice(0, 128)}`;
    }
    const uid = userId != null && Number.isFinite(userId) && userId > 0 ? String(userId) : fallbackLabel;
    return `leo:${tenantId}:user:${uid}`;
}
/**
 * Cadeia de Promises por chave — nunca executa dois `work` ao mesmo tempo para a mesma chave.
 */
export class LeoSessionGate {
    static instance;
    tails = new Map();
    static getInstance() {
        if (!LeoSessionGate.instance) {
            LeoSessionGate.instance = new LeoSessionGate();
        }
        return LeoSessionGate.instance;
    }
    /**
     * Enfileira trabalho: o próximo só inicia após o anterior terminar (sucesso ou erro).
     */
    async run(sessionKey, work) {
        globalStats.enqueued += 1;
        const prev = this.tails.get(sessionKey) ?? Promise.resolve();
        const next = prev
            .catch(() => {
            /* não quebrar a cadeia por falha anterior */
        })
            .then(() => work());
        this.tails.set(sessionKey, next.then(() => undefined, () => undefined));
        try {
            const out = await next;
            globalStats.completed += 1;
            return out;
        }
        catch (e) {
            globalStats.failed += 1;
            throw e;
        }
    }
    /** Para testes / diagnóstico. */
    resetStats() {
        globalStats = { enqueued: 0, completed: 0, failed: 0 };
    }
    getStats() {
        return { ...globalStats };
    }
    clearChainForTests(sessionKey) {
        this.tails.delete(sessionKey);
    }
}
export const leoSessionGate = LeoSessionGate.getInstance();
