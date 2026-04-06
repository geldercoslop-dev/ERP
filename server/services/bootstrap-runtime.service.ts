import { getDb } from "../db/index.js";
import { waitForDatabaseReady } from "../_core/db-bootstrap.js";
import { bootstrapDatabase } from "./bootstrap.service.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../_core/service-entry-guard.js";

export async function runDatabaseBootstrapFlow(): Promise<void> {
  await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
    const db = await getDb();
    try {
      await bootstrapDatabase(db);
      console.log("[BOOT] database bootstrap ok");
    } catch (bootstrapErr) {
      console.warn("[BOOT] database bootstrap falhou, continuando...", bootstrapErr);
      console.log("[BOOT] server liberado mesmo com falha de migration");
    }

    try {
      await waitForDatabaseReady();
    } catch (guardErr) {
      console.warn("[BOOT] database guard check falhou, continuando...", guardErr);
    }
  });
}