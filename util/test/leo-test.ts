/**
 * Anti-regressão LEO — fila por sessão.
 * Uso: pnpm exec tsx util/test/leo-test.ts
 */
import { buildLeoSessionKey, leoSessionGate } from "../../server/leo/runtime/leo-session-gate";

async function main(): Promise<void> {
  const key = buildLeoSessionKey(1, 99, "aba-teste");
  const order: number[] = [];

  const p = async (n: number, ms: number) => {
    await leoSessionGate.run(key, async () => {
      order.push(n);
      await new Promise((r) => setTimeout(r, ms));
      order.push(n);
    });
  };

  await Promise.all([p(1, 15), p(2, 5), p(3, 5)]);

  const ok =
    order.length === 6 &&
    order[0] === order[1] &&
    order[2] === order[3] &&
    order[4] === order[5] &&
    [order[0], order[2], order[4]].sort().join(",") === "1,2,3";

  if (!ok) {
    console.error("LEO session gate: ordem inválida", order);
    process.exit(1);
  }
  console.log("✔ leo-test: fila por sessão OK", order);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
