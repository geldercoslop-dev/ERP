import { getDb } from "../db/index.js";
import { waitForDatabaseReady } from "../_core/db-bootstrap.js";
import { bootstrapDatabase } from "./bootstrap.service.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../_core/service-entry-guard.js";

export async function runDatabaseBootstrapFlow(): Promise<void> {
  await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
    const db = await getDb();
    // FALHA FATAL: bootstrap do banco é obrigatório
    await bootstrapDatabase(db);
    console.log("[BOOT] database bootstrap ok");

    // FALHA FATAL: database guard check é obrigatório
    await waitForDatabaseReady();
  });
}