/**
 * Stress / circuit breaker (sem DB) — valida abertura, fallback e recovery.
 * Uso: pnpm exec tsx util/test/db-stress-test.ts
 */
import { DbCircuitBreaker } from "../../server/services/ai/db-resilience";

async function main(): Promise<void> {
  const cb = new DbCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 200 });

  let calls = 0;
  const failing = async () => {
    calls += 1;
    throw new Error("db down");
  };
  const fallback = async () => "fallback-ok";

  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(failing, fallback);
    } catch {
      /* esperado enquanto circuito fechado */
    }
  }
  const r3 = await cb.execute(failing, fallback);

  if (r3 !== "fallback-ok") {
    console.error("Esperado fallback após abrir circuito", r3);
    process.exit(1);
  }
  if (!cb.isOpen()) {
    console.error("Circuito deveria estar aberto");
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 250));
  const ok = await cb.execute(async () => "recovered", async () => "should-not");
  if (ok !== "recovered") {
    console.error("Recovery half-open falhou", ok);
    process.exit(1);
  }

  console.log("✔ db-stress-test: circuit breaker OK", cb.getStats());
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
