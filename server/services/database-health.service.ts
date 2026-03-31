import { performance } from "perf_hooks";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

type StatusRow = { Variable_name?: string; Value?: string | number };

function unpackExecuteRows(result: unknown): StatusRow[] {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as StatusRow[];
    if (first && typeof first === "object" && "Variable_name" in (first as object)) {
      return [first as StatusRow];
    }
  }
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: StatusRow[] }).rows;
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

export async function pingDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
  threadsConnected?: number;
}> {
  const start = performance.now();
  const db = await getDb();
  if (!db) return { ok: false, latencyMs: -1 };
  try {
    await db.execute(sql`SELECT 1`);
    const latencyMs = performance.now() - start;
    let threadsConnected: number | undefined;
    try {
      const raw = await db.execute(sql`SHOW STATUS LIKE 'Threads_connected'`);
      const rows = unpackExecuteRows(raw);
      const v = rows[0]?.Value;
      if (v !== undefined) threadsConnected = Number(v);
    } catch {
      void 0;
    }
    return { ok: true, latencyMs, threadsConnected };
  } catch {
    return { ok: false, latencyMs: performance.now() - start };
  }
}
