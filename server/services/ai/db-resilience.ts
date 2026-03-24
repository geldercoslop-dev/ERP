/**
 * Circuit breaker leve para resiliência a falhas/latência de DB (testável sem middleware).
 * Usado em testes de stress e opcionalmente por serviços que queiram fallback explícito.
 */

export type DbCircuitState = "closed" | "open" | "half_open";

export type DbCircuitBreakerOptions = {
  /** Falhas consecutivas para abrir o circuito. */
  failureThreshold: number;
  /** Tempo (ms) com circuito aberto antes de permitir uma tentativa (half-open). */
  resetTimeoutMs: number;
  /** Latência simulada extra (testes). */
  artificialLatencyMs?: number;
};

const defaultOpts: DbCircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 10_000,
};

/**
 * Circuit breaker simples com estados closed → open → half-open → closed.
 */
export class DbCircuitBreaker {
  private failures = 0;
  private successes = 0;
  private state: DbCircuitState = "closed";
  private openedAt = 0;
  private readonly opts: DbCircuitBreakerOptions;

  constructor(opts: Partial<DbCircuitBreakerOptions> = {}) {
    this.opts = { ...defaultOpts, ...opts };
  }

  getState(): DbCircuitState {
    if (this.state === "open" && Date.now() - this.openedAt >= this.opts.resetTimeoutMs) {
      this.state = "half_open";
    }
    return this.state;
  }

  isOpen(): boolean {
    return this.getState() === "open";
  }

  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.state = "closed";
    this.openedAt = 0;
  }

  getStats(): { failures: number; successes: number; state: DbCircuitState } {
    return { failures: this.failures, successes: this.successes, state: this.getState() };
  }

  /**
   * Executa operação; em circuito aberto retorna `fallback` sem chamar `fn`.
   */
  async execute<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
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
    } catch (e) {
      this.onFailure();
      if (this.state === "open") {
        return fallback();
      }
      throw e;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successes += 1;
    if (this.state === "half_open") {
      this.state = "closed";
    }
  }

  private onFailure(): void {
    this.failures += 1;
    if (this.state === "half_open" || this.failures >= this.opts.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
}
