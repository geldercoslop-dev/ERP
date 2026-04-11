/**
 * Sistema de Detecção Inteligente de Autenticação
 * Detecta automaticamente qual tabela de login existe no banco
 */
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { authLogger } from './logger.js';
import { recordQueryTime } from "../_core/system-monitor.js";
import * as fs from "fs";
import * as path from "path";
import { ValidationError, InfrastructureError } from './errors/typed-errors.js';

interface AuthConfig {
  table: "users" | "vendedores";
  usernameField: string;
  passwordField: string;
  emailField?: string;
  roleField?: string;
}

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

let authConfig: AuthConfig | null = null;
let detectionCompleted = false;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ValidationError(`[Auth Detection] variável obrigatória ausente: ${name}`);
  }
  return value;
}

function getRequiredDbConfig(): DatabaseConfig {
  const host = requireEnv("DB_HOST");
  const portRaw = requireEnv("DB_PORT");
  const user = requireEnv("DB_USER");
  const password = requireEnv("DB_PASSWORD");
  const database = requireEnv("DB_NAME");
  const port = Number.parseInt(portRaw, 10);

  if (!Number.isFinite(port) || port <= 0) {
    throw new ValidationError("[Auth Detection] DB_PORT inválida");
  }

  return { host, port, user, password, database };
}

/**
 * Conecta ao banco com retry automático
 */
async function connectWithRetry(config: DatabaseConfig, maxRetries: number = 5): Promise<mysql.Connection> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      authLogger.info(`[Auth Detection] Tentativa ${attempt}/${maxRetries} de conexão com banco...`);
      const connection = await mysql.createConnection(config);
      await connection.ping();
      authLogger.info("[Auth Detection] ✅ Conexão estabelecida com sucesso");
      return connection;
    } catch (error) {
      lastError = error as Error;
      authLogger.error(`[Auth Detection] ❌ Falha na conexão (tentativa ${attempt}/${maxRetries}): ` + 
        (error instanceof Error ? error.message : String(error)));
      
      if (attempt < maxRetries) {
        authLogger.info("[Auth Detection] ⏳ Aguardando 2 segundos para próxima tentativa...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  throw lastError || new Error("Failed to connect to database after retries");
}

/**
 * Verifica se uma tabela existe no banco
 */
async function tableExists(connection: mysql.Connection, tableName: string): Promise<boolean> {
  try {
    const [rows] = await connection.execute(
      `SHOW TABLES LIKE '${tableName.replace(/'/g, "''")}'`
    );
    const tableRows = rows as unknown[];
    return Array.isArray(tableRows) && tableRows.length > 0;
  } catch (error) {
    console.error(`[Auth Detection] Erro ao verificar tabela ${tableName}:`, error);
    return false;
  }
}

/**
 * Obtém estrutura da tabela
 */
async function getTableStructure(connection: mysql.Connection, tableName: string): Promise<string[]> {
  try {
    const [rows] = await connection.execute("DESCRIBE ??", [tableName]);
    const tableRows = rows as unknown[];
    return Array.isArray(tableRows) ? tableRows.map((row: unknown) => (row as { Field: string }).Field) : [];
  } catch (error) {
    console.error(`[Auth Detection] Erro ao obter estrutura da tabela ${tableName}:`, error);
    return [];
  }
}

/**
 * Detecta campos de login na tabela users
 */
function detectUserAuthFields(columns: string[]): Partial<AuthConfig> | null {
  const usernameField = columns.find(col => 
    ["username", "login", "email", "openId"].includes(col)
  );
  
  const passwordField = columns.find(col => 
    ["password", "senha", "pass"].includes(col)
  );
  
  const emailField = columns.find(col => 
    ["email", "email_address"].includes(col)
  );
  
  const roleField = columns.find(col => 
    ["role", "perfil", "user_role"].includes(col)
  );
  
  if (usernameField && passwordField) {
    return {
      table: "users",
      usernameField,
      passwordField,
      emailField,
      roleField
    };
  }
  
  return null;
}

/**
 * Detecta campos de login na tabela vendedores
 */
function detectVendedorAuthFields(columns: string[]): Partial<AuthConfig> | null {
  const usernameField = columns.find(col => 
    ["usuario", "login", "email", "nome"].includes(col)
  );
  
  const passwordField = columns.find(col => 
    ["senha", "password", "pass"].includes(col)
  );
  
  const emailField = columns.find(col => 
    ["email", "email_address"].includes(col)
  );
  
  if (usernameField && passwordField) {
    return {
      table: "vendedores",
      usernameField,
      passwordField,
      emailField
    };
  }
  
  return null;
}

/**
 * Cria admin automaticamente se não existir
 */
async function createAdminIfNeeded(connection: mysql.Connection, config: AuthConfig): Promise<void> {
  try {
    console.log(`[Auth Detection] Verificando admin na tabela ${config.table}...`);
    
    // Verificar se admin já existe
    const [existingRows] = await connection.execute(
      `SELECT * FROM ${mysql.escapeId(config.table)} WHERE ${mysql.escapeId(config.usernameField)} = ? LIMIT 1`,
      ["admin"]
    );
    
    const existingRowsArray = existingRows as unknown[];
    const existing = Array.isArray(existingRowsArray) && existingRowsArray.length > 0 ? existingRowsArray[0] : null;
    
    if (existing && typeof existing === 'object' && 'length' in existing) {
      console.log("[Auth Detection] ✅ Admin já existe");
      return;
    }
    
    console.log("[Auth Detection] Criando admin automaticamente...");
    
    // Criar hash da senha
    const adminPassword = "admin123";
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    // Determinar campos para inserção
    const fields = [config.usernameField, config.passwordField];
    const values = ["admin", hashedPassword];
    
    // Adicionar tenantId se existir na tabela
    const tableColumns = await getTableStructure(connection, config.table);
    if (tableColumns.includes("tenantId")) {
      fields.push("tenantId");
      values.push("1");
    }
    
    // Adicionar campos adicionais se existirem
    if (config.emailField) {
      fields.push(config.emailField);
      values.push("admin@local.com");
    }
    
    if (config.table === "users" && config.roleField) {
      fields.push(config.roleField);
      values.push("admin");
    }
    
    if (config.table === "vendedores") {
      // Campos específicos de vendedores
      fields.push("admin", "ativo");
      values.push("1", "1");
    }
    
    // Adicionar timestamps se existirem
    if (tableColumns.includes("createdAt")) {
      fields.push("createdAt");
      values.push("NOW()");
    }
    if (tableColumns.includes("updatedAt")) {
      fields.push("updatedAt");
      values.push("NOW()");
    }
    
    // Construir query - se tiver timestamps, usar SQL direto
    let query: string;
    let finalValues: any[] = [];
    
    if (values.includes("NOW()")) {
      // Query com timestamps SQL
      const sqlValues = values.map(v => v === "NOW()" ? "NOW()" : "?").join(", ");
      query = `INSERT INTO ${mysql.escapeId(config.table)} (${fields.map(f => mysql.escapeId(f)).join(", ")}) VALUES (${sqlValues})`;
      finalValues = values.filter(v => v !== "NOW()");
    } else {
      // Query normal
      const placeholders = values.map(() => "?").join(", ");
      query = `INSERT INTO ${mysql.escapeId(config.table)} (${fields.map(f => mysql.escapeId(f)).join(", ")}) VALUES (${placeholders})`;
      finalValues = values;
    }
    
    await connection.execute(query, finalValues);
    
    console.log("[Auth Detection] ✅ Admin criado com sucesso");
    console.log("[Auth Detection] 📝 Credenciais:");
    console.log("[Auth Detection]    Usuário: admin");
    console.log("[Auth Detection]    Senha: [REDACTED]");
    console.log("[Auth Detection]    AVISO: Senha padrão detectada - altere imediatamente!");
    
  } catch (error) {
    console.error("[Auth Detection] Erro ao criar admin:", error);
    throw error;
  }
}

/**
 * Função principal de detecção
 */
export async function detectAuthConfig(): Promise<AuthConfig> {
  if (detectionCompleted && authConfig) {
    return authConfig;
  }
  
  console.log("🔍 Iniciando detecção inteligente de autenticação...");
  
  // Configuração do banco
  const dbConfig = getRequiredDbConfig();
  
  console.log(`[Auth Detection] Configuração: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  
  let connection: mysql.Connection | null = null;
  
  try {
    // FASE 1: Conectar ao banco
    connection = await connectWithRetry(dbConfig);
    
    // FASE 2: Inspecionar estrutura do banco
    console.log("[Auth Detection] 🔍 Inspecionando tabelas do banco...");
    
    const hasUsers = await tableExists(connection, "users");
    const hasVendedores = await tableExists(connection, "vendedores");
    
    console.log(`[Auth Detection] Tabelas encontradas: users=${hasUsers}, vendedores=${hasVendedores}`);
    
    if (!hasUsers && !hasVendedores) {
      throw new InfrastructureError("Nenhuma tabela de autenticação encontrada (users ou vendedores)");
    }
    
    // FASE 3: Detectar colunas de login
    let detectedConfig: Partial<AuthConfig> | null = null;
    
    // FASE 4: Determinar tabela de autenticação (prioridade: users > vendedores)
    if (hasUsers) {
      console.log("[Auth Detection] Analisando tabela users...");
      const userColumns = await getTableStructure(connection, "users");
      console.log(`[Auth Detection] Colunas em users: ${userColumns.join(", ")}`);
      
      detectedConfig = detectUserAuthFields(userColumns);
      
      if (detectedConfig) {
        console.log("[Auth Detection] ✅ Tabela users detectada para autenticação");
      }
    }
    
    if (!detectedConfig && hasVendedores) {
      console.log("[Auth Detection] Analisando tabela vendedores...");
      const vendedorColumns = await getTableStructure(connection, "vendedores");
      console.log(`[Auth Detection] Colunas em vendedores: ${vendedorColumns.join(", ")}`);
      
      detectedConfig = detectVendedorAuthFields(vendedorColumns);
      
      if (detectedConfig) {
        console.log("[Auth Detection] ✅ Tabela vendedores detectada para autenticação");
      }
    }
    
    if (!detectedConfig) {
      throw new InfrastructureError("Não foi possível detectar campos de autenticação nas tabelas existentes");
    }
    
    // Configuração final
    if (!detectedConfig.table) {
      throw new ValidationError("Table not detected in auth configuration");
    }
    if (!detectedConfig.usernameField) {
      throw new ValidationError("Username field not detected in auth configuration");
    }
    if (!detectedConfig.passwordField) {
      throw new ValidationError("Password field not detected in auth configuration");
    }
    
    authConfig = {
      table: detectedConfig.table,
      usernameField: detectedConfig.usernameField,
      passwordField: detectedConfig.passwordField,
      emailField: detectedConfig.emailField,
      roleField: detectedConfig.roleField
    };
    
    // FASE 5: Log de diagnóstico
    console.log("[Auth Detection] 📋 Configuração detectada:");
    console.log(`[Auth Detection]    Tabela: ${authConfig.table}`);
    console.log(`[Auth Detection]    Campo usuário: ${authConfig.usernameField}`);
    console.log(`[Auth Detection]    Campo senha: ${authConfig.passwordField}`);
    if (authConfig.emailField) {
      console.log(`[Auth Detection]    Campo email: ${authConfig.emailField}`);
    }
    if (authConfig.roleField) {
      console.log(`[Auth Detection]    Campo role: ${authConfig.roleField}`);
    }
    
    // FASE 6: Criar admin automaticamente
    await createAdminIfNeeded(connection, authConfig);
    
    detectionCompleted = true;
    
    // Salvar configuração para uso posterior
    await saveAuthConfigToFile(authConfig);
    
    console.log("[Auth Detection] 🎉 Detecção de autenticação concluída com sucesso!");
    
    return authConfig;
    
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Salva configuração em arquivo para cache
 */
async function saveAuthConfigToFile(config: AuthConfig): Promise<void> {
  try {
    const configPath = path.join(process.cwd(), ".auth-config.json");
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`[Auth Detection] Configuração salva em: ${configPath}`);
  } catch (error) {
    console.log("[Auth Detection] Não foi possível salvar configuração em arquivo:", error);
  }
}

/**
 * Carrega configuração do cache
 */
async function loadAuthConfigFromFile(): Promise<AuthConfig | null> {
  try {
    const configPath = path.join(process.cwd(), ".auth-config.json");
    if (fs.existsSync(configPath)) {
      const content = await fs.promises.readFile(configPath, "utf-8");
      const config = JSON.parse(content) as AuthConfig;
      console.log("[Auth Detection] Configuração carregada do cache");
      return config;
    }
  } catch (error) {
    console.log("[Auth Detection] Não foi possível carregar configuração do cache:", error);
  }
  return null;
}

/**
 * Obtém configuração de autenticação (com cache)
 */
export async function getAuthConfig(): Promise<AuthConfig> {
  if (authConfig && detectionCompleted) {
    return authConfig;
  }
  
  // Tentar carregar do cache primeiro
  const cachedConfig = await loadAuthConfigFromFile();
  if (cachedConfig) {
    authConfig = cachedConfig;
    detectionCompleted = true;
    return authConfig;
  }
  
  // Se não tiver cache, detectar
  return await detectAuthConfig();
}

/**
 * Função universal de autenticação
 */
export async function authenticateUser(username: string, password: string): Promise<{ id: number; [key: string]: unknown }> {
  const config = await getAuthConfig();
  const dbConfig = getRequiredDbConfig();
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Buscar usuário
    const [rows] = await connection.execute(
      `SELECT * FROM ${mysql.escapeId(config.table)} WHERE ${mysql.escapeId(config.usernameField)} = ? LIMIT 1`,
      [username]
    );
    
    const usersArray = rows as unknown[];
    const users = Array.isArray(usersArray) && usersArray.length > 0 ? usersArray[0] : null;
    
    if (!users || typeof users !== 'object') {
      throw new ValidationError("Usuário não encontrado");
    }
    
    const user = users as { [key: string]: unknown };
    
    // Verificar senha
    const passwordHash = user[config.passwordField];
    if (typeof passwordHash !== 'string') {
      throw new ValidationError("Campo de senha inválido");
    }
    
    const passwordMatch = await bcrypt.compare(password, passwordHash);
    
    if (!passwordMatch) {
      throw new ValidationError("Senha incorreta");
    }
    
    // Retornar usuário sem senha
    const { [config.passwordField]: _, ...userWithoutPassword } = user;
    
    // Validar que tem id
    if (!('id' in userWithoutPassword) || typeof userWithoutPassword.id !== 'number') {
      throw new ValidationError("Usuário sem ID válido");
    }
    
    return userWithoutPassword as { id: number; [key: string]: unknown };
    
  } finally {
    await connection.end();
  }
}

/**
 * Reset da detecção (para testes)
 */
export function resetAuthDetection(): void {
  authConfig = null;
  detectionCompleted = false;
}
