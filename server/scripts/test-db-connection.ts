import "dotenv/config";
import { getDb } from "../db/index";

async function testDatabaseConnection() {
  console.log("Testando conexão com o banco de dados...");
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  
  try {
    const db = await getDb();
    if (!db) {
      console.error("❌ Falha ao obter conexão com o banco de dados");
      process.exit(1);
    }
    
    // Testar uma consulta simples
    const result = await (db as any).execute("SELECT 1 as test");
    console.log("✅ Conexão com banco de dados estabelecida com sucesso!");
    console.log("Resultado do teste:", result);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao testar conexão:", error);
    process.exit(1);
  }
}

testDatabaseConnection().catch(console.error);