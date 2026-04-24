/**
 * Circuit breaker leve para resiliência a falhas/latência de DB (testável sem middleware).
 * Usado em testes de stress e opcionalmente por serviços que queiram fallback explícito.
 */
const defaultOpts = {
    failureThreshold: 5,
    resetTimeoutMs: 10_000,
};
/**
 * Circuit breaker simples com estados closed → open → half-open → closed.
 */
export class DbCircuitBreaker {
    failures = 0;
    successes = 0;
    state = "closed";
    openedAt = 0;
    opts;
    constructor(opts = {}) {
        this.opts = { ...defaultOpts, ...opts };
    }
    getState() {
        if (this.state === "open" && Date.now() - this.openedAt >= this.opts.resetTimeoutMs) {
            this.state = "half_open";
        }
        return this.state;
    }
    isOpen() {
        return this.getState() === "open";
    }
    reset() {
        this.failures = 0;
        this.successes = 0;
        this.state = "closed";
        this.openedAt = 0;
    }
    getStats() {
        return { failures: this.failures, successes: this.successes, state: this.getState() };
    }
    /**
     * Executa operação; em circuito aberto retorna `fallback` sem chamar `fn`.
     */
    async execute(fn, fallback) {
        const latency = this.opts.artificialLatencyMs ?? 0;
        if (latency > 0) {
            await new Promise((r) => setTimeout(r, latency));
        }
        const st = this.getState();
        if (st === "open") {
            return fallback();
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (e) {
            this.onFailure();
            if (this.state === "open") {
                return fallback();
            }
            throw e;
        }
    }
    onSuccess() {
        this.failures = 0;
        this.successes += 1;
        if (this.state === "half_open") {
            this.state = "closed";
        }
    }
    onFailure() {
        this.failures += 1;
        if (this.state === "half_open" || this.failures >= this.opts.failureThreshold) {
            this.state = "open";
            this.openedAt = Date.now();
        }
    }
}
