import * as mysql from "mysql2/promise";

/**
 * Configuração e gerenciamento da conexão com o banco de dados
 * Implementação com Pool de conexões, retry e timeouts
 */

// Opções de conexão padrão
const DEFAULT_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'vendas',
  password: 'vendas123',
  database: 'vendas_app',
  // Configurações de Pool (apenas opções suportadas pelo mysql2)
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
  connectTimeout: 10000,
  maxIdle: 10,
  idleTimeout: 60000,
  debug: process.env.NODE_ENV === 'development',
};

// Singleton do pool de conexões
let _pool: mysql.Pool | null = null;

/**
 * Obtém a configuração do banco de dados a partir das variáveis de ambiente
 */
function getDatabaseConfig() {
  let config = { ...DEFAULT_CONFIG };
  
  // Se DATABASE_URL estiver definido, use-o para sobrescrever a configuração padrão
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      config = {
        ...config,
        host: url.hostname,
        port: parseInt(url.port || '3306', 10),
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1) // Remove leading slash
      };
    } catch (error) {
      console.error("[Database] Invalid DATABASE_URL format:", error);
      console.warn("[Database] Falling back to default configuration");
    }
  } else {
    // Se não houver DATABASE_URL, tente usar variáveis de ambiente individuais
    if (process.env.DB_HOST) config.host = process.env.DB_HOST;
    if (process.env.DB_PORT) config.port = parseInt(process.env.DB_PORT, 10);
    if (process.env.DB_USER) config.user = process.env.DB_USER;
    if (process.env.DB_PASSWORD) config.password = process.env.DB_PASSWORD;
    if (process.env.DB_NAME) config.database = process.env.DB_NAME;
  }
  
  return config;
}

/**
 * Cria e retorna um pool de conexões MySQL
 */
export async function getConnectionPool(): Promise<mysql.Pool> {
  if (_pool) {
    return _pool;
  }
  
  const config = getDatabaseConfig();
  console.log(`[Database] Creating connection pool to MySQL at ${config.host}:${config.port}`);
  
  _pool = mysql.createPool(config);
  
  // Verificar se o pool está funcionando
  try {
    await testPool(_pool);
    console.log("[Database] Connection pool created and tested successfully");
    
    // Configurar evento para lidar com erros de conexão.
    // Tipos do mysql2/promise não expõem todos os eventos (mas runtime é EventEmitter).
    (_pool as any).on?.("error", (err: any) => {
      console.error("[Database] Unexpected pool error:", err);

      const code = err?.code as string | undefined;
      if (
        code === "PROTOCOL_CONNECTION_LOST" ||
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT"
      ) {
        console.log("[Database] Connection lost. Attempting to recreate pool...");
        _pool = null; // Força recriação na próxima chamada
      }
    });
    
    return _pool;
  } catch (error) {
    console.error("[Database] Failed to create connection pool:", error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Database connection pool failed: ${msg}`);
  }
}

/**
 * Testa o pool de conexões com retry
 */
async function testPool(pool: mysql.Pool, maxRetries = 3, retryDelay = 2000): Promise<void> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = await pool.getConnection();
      await conn.query('SELECT 1 AS connection_test');
      conn.release();
      return; // Sucesso, sair da função
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Database] Connection test failed (attempt ${attempt}/${maxRetries}):`,
        msg
      );
      
      if (attempt < maxRetries) {
        console.log(`[Database] Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Aumentar o delay exponencialmente para cada tentativa
        retryDelay *= 1.5;
      }
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  const lastMsg =
    lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(
    `Failed to connect to database after ${maxRetries} attempts: ${lastMsg}`
  );
}

/**
 * Obtém uma conexão do pool com retry automático
 */
export async function getConnection(maxRetries = 3): Promise<mysql.PoolConnection> {
  const pool = await getConnectionPool();
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.getConnection();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Database] Failed to get connection (attempt ${attempt}/${maxRetries}):`,
        msg
      );
      
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1); // Backoff exponencial: 1s, 2s, 4s...
        console.log(`[Database] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  const lastMsg =
    lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(
    `Failed to get database connection after ${maxRetries} attempts: ${lastMsg}`
  );
}

/**
 * Executa uma query com retry automático
 */
export async function executeQuery(
  query: string, 
  params: any[] = [], 
  maxRetries = 3
): Promise<[unknown, mysql.FieldPacket[]]> {
  let conn: mysql.PoolConnection | null = null;
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      conn = await getConnection();
      const result = await conn.query(query, params);
      return result;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Database] Query failed (attempt ${attempt}/${maxRetries}):`,
        msg
      );
      
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1); // Backoff exponencial
        console.log(`[Database] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
  
  const lastMsg =
    lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(`Query failed after ${maxRetries} attempts: ${lastMsg}`);
}

/**
 * Fecha o pool de conexões de forma segura
 */
export async function closeConnectionPool(): Promise<void> {
  if (_pool) {
    try {
      await _pool.end();
      console.log("[Database] Connection pool closed successfully");
      _pool = null;
    } catch (error) {
      console.error("[Database] Error closing connection pool:", error);
    }
  }
}