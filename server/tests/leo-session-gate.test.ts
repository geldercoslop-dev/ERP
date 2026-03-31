/**
 * Anti-regressão: fila LEO por sessão — sem execução paralela na mesma chave.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildLeoSessionKey, leoSessionGate } from "../leo/runtime/leo-session-gate.js";

describe("LEO session gate", () => {
  beforeEach(() => {
    leoSessionGate.resetStats();
  });

  it("serializa trabalhos na mesma sessionKey", async () => {
    const key = buildLeoSessionKey(7, 42, "win-1");
    const order: number[] = [];

    await Promise.all([
      leoSessionGate.run(key, async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 15));
        order.push(1);
      }),
      leoSessionGate.run(key, async () => {
        order.push(2);
        await new Promise((r) => setTimeout(r, 5));
        order.push(2);
      }),
    ]);

    expect(order.length).toBe(4);
    expect(order[0]).toBe(order[1]);
    expect(order[2]).toBe(order[3]);
    expect(order[0]).not.toBe(order[2]);
  });

  it("chaves diferentes executam em paralelo", async () => {
    const k1 = buildLeoSessionKey(1, 1, "x");
    const k2 = buildLeoSessionKey(1, 2, "y");
    let overlap = false;
    let active = 0;

    await Promise.all([
      leoSessionGate.run(k1, async () => {
        active += 1;
        if (active > 1) overlap = true;
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
      }),
      leoSessionGate.run(k2, async () => {
        active += 1;
        if (active > 1) overlap = true;
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
      }),
    ]);

    expect(overlap).toBe(true);
  });
});
