/**
 * Aplica migrações Drizzle (pasta drizzle/ — onde estão os .sql e meta/_journal.json).
 * Uso: npm run db:migrate
 * Em produção: rode após backup e confira /api/health.
 */
import path from "path";
import "../_core/loadEnv.js";
import { createServiceContext, runWithServiceContext } from "../../scripts/context/service-context.js";
async function main() {
    await runWithServiceContext(createServiceContext(), async () => {
        const { getDb } = await import("../db/index.js");
        const { migrate } = await import("drizzle-orm/mysql2/migrator");
        const db = await getDb();
        if (!db) {
            console.error("Falha ao conectar ao banco. Verifique DATABASE_URL ou DB_*.");
            process.exit(1);
        }
        const migrationsFolder = path.resolve(process.cwd(), "drizzle");
        try {
            await migrate(db, { migrationsFolder });
            console.log("Migrações aplicadas com sucesso.");
            process.exit(0);
        }
        catch (err) {
            console.error("Erro ao aplicar migrações:", err);
            process.exit(1);
        }
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
