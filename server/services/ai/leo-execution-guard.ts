/**
 * Limites de execução do LEO por requisição.
 * Proteção contra loops: máximo de tools por requisição e tempo total.
 */

const MAX_TOOLS_PER_REQUEST = 5;
const MAX_TOTAL_MS = 10_000;

export type ExecutionGuard = {
  startRequest(): void;
  canRunTool(): boolean;
  recordToolExecuted(): void;
};

/**
 * Cria um guard para uma requisição (ex.: uma pergunta do usuário).
 * Deve ser chamado startRequest() no início; antes de cada tool, canRunTool();
 * após cada execução, recordToolExecuted().
 */
export function createExecutionGuard(): ExecutionGuard {
  let toolCount = 0;
  let startTime = 0;

  return {
    startRequest() {
      toolCount = 0;
      startTime = Date.now();
    },
    canRunTool() {
      if (toolCount >= MAX_TOOLS_PER_REQUEST) return false;
      if (Date.now() - startTime >= MAX_TOTAL_MS) return false;
      return true;
    },
    recordToolExecuted() {
      toolCount += 1;
    },
  };
}

export { MAX_TOOLS_PER_REQUEST, MAX_TOTAL_MS };
