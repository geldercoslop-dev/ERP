import { performance } from "perf_hooks";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { safeDbCall } from "./safe-db-call.js";
function unpackExecuteRows(result) {
    if (Array.isArray(result)) {
        const first = result[0];
        if (Array.isArray(first))
            return first;
        if (first && typeof first === "object" && "Variable_name" in first) {
            return [first];
        }
    }
    if (result && typeof result === "object" && "rows" in result) {
        const rows = result.rows;
        return Array.isArray(rows) ? rows : [];
    }
    return []; // Ausência legítima - sem status rows disponíveis
}
export async function pingDatabase(context = "SYSTEM") {
    const start = performance.now();
    const db = await safeDbCall(context, async () => {
        return getDb();
    });
    if (!db)
        return { ok: false, latencyMs: -1 };
    try {
        await safeDbCall(context, () => db.execute(sql `SELECT 1`));
        const latencyMs = performance.now() - start;
        let threadsConnected;
        try {
            const raw = await safeDbCall(context, () => db.execute(sql `SHOW STATUS LIKE 'Threads_connected'`));
            const rows = unpackExecuteRows(raw);
            const v = rows[0]?.Value;
            if (v !== undefined)
                threadsConnected = Number(v);
        }
        catch {
            void 0;
        }
        return { ok: true, latencyMs, threadsConnected };
    }
    catch {
        return { ok: false, latencyMs: performance.now() - start };
    }
}
