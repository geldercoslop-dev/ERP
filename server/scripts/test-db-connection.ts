import "dotenv/config";
import { sql } from "drizzle-orm";
import { createServiceContext, runWithServiceContext } from "../core/service-context.js";
import { getDb } from "../db/index.js";

async function testDatabaseConnection() {
  console.log("Testando conexão com o banco de dados...");
  console.log("DATABASE_URL:", process.env.DATABASE_URL);

  try {
    await runWithServiceContext(createServiceContext(), async () => {
      const db = await getDb();
      if (!db) {
        console.error("❌ Falha ao obter conexão com o banco de dados");
        process.exit(1);
      }

      const result = await db.execute(sql`SELECT 1 AS test`);
      console.log("✅ Conexão com banco de dados estabelecida com sucesso!");
      console.log("Resultado do teste:", result);
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao testar conexão:", error);
    process.exit(1);
  }
}

testDatabaseConnection().catch(console.error);
