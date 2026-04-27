/**
 * Router DB Wall - Parede local contra DB direto nos routers
 * 
 * Protege os routers principais contra acesso direto ao banco de dados.
 * Arquitetura obrigatória: ROUTER → SERVICE → DB
 * 
 * Routers protegidos:
 * - server/routers.ts
 * - server/routers/produtos.router.ts
 */

import { readFileSync } from "fs";

const PROTECTED_ROUTERS = [
  "server/routers.ts",
  "server/routers/produtos.router.ts"
];

// Padrões de DB direto que devem ser bloqueados
const DB_PATTERNS = [
  // Imports diretos de DB
  { pattern: /from\s+["']\.\/db/, message: "Import direto de ./db" },
  { pattern: /from\s+["']\.\.\/db/, message: "Import direto de ../db" },
  { pattern: /from\s+["']\.\.\/\.\.\/db/, message: "Import direto de ../../db" },
  
  // Acesso direto a DB
  { pattern: /(^|[^a-zA-Z0-9_])db\./, message: "Acesso direto a db." },
  { pattern: /getDb\s*\(/, message: "Chamada direta a getDb(" },
  
  // Conexões diretas
  { pattern: /db_conn/, message: "Uso de db_conn" },
  { pattern: /connection\.query\s*\(/, message: "connection.query(" },
  { pattern: /conn\.query\s*\(/, message: "conn.query(" },
  { pattern: /pool\.query\s*\(/, message: "pool.query(" },
  { pattern: /db\.query\s*\(/, message: "db.query(" },
  
  // Operações diretas em transação (tx deve ser usado apenas em services)
  { pattern: /(^|[^a-zA-Z0-9_])tx\.insert/, message: "tx.insert - use service layer" },
  { pattern: /(^|[^a-zA-Z0-9_])tx\.update/, message: "tx.update - use service layer" },
  { pattern: /(^|[^a-zA-Z0-9_])tx\.delete/, message: "tx.delete - use service layer" },
  { pattern: /(^|[^a-zA-Z0-9_])tx\.select/, message: "tx.select - use service layer" },
  { pattern: /(^|[^a-zA-Z0-9_])tx\.execute/, message: "tx.execute - use service layer" },
];

// Padrões que NÃO devem ser bloqueados (tRPC query)
const ALLOWED_PATTERNS = [
  /publicProcedure\.query/,
  /protectedProcedure\.query/,
  /adminProcedure\.query/,
  /router\s*\(/,
];

let violationFound = false;

for (const routerPath of PROTECTED_ROUTERS) {
  try {
    const content = readFileSync(routerPath, "utf-8");
    const lines = content.split("\n");
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmedLine = line.trim();

      // Ignorar comentários de linha única
      if (trimmedLine.startsWith("//")) {
        continue;
      }

      // Ignorar linhas de JSDoc (começam com *)
      if (trimmedLine.startsWith("*")) {
        continue;
      }

      // Rastrear comentários de bloco /* ... */
      if (trimmedLine.includes("/*")) {
        inBlockComment = true;
      }
      if (inBlockComment) {
        if (trimmedLine.includes("*/")) {
          inBlockComment = false;
        }
        continue; // Pular linhas dentro de bloco de comentário
      }

      // Verificar se a linha contém algum padrão permitido (tRPC)
      const isAllowed = ALLOWED_PATTERNS.some(p => p.test(line));
      
      if (isAllowed) {
        continue; // Pular linha - é tRPC válido
      }

      // Verificar violações de DB
      for (const { pattern, message } of DB_PATTERNS) {
        if (pattern.test(line)) {
          console.error(`
🚫 PAREDE DE ARQUITETURA ATIVADA
================================

Arquivo: ${routerPath}
Linha: ${lineNumber}
Conteúdo: ${line.trim()}

Regra violada: ${message}

EXPLICAÇÃO:
Routers não podem acessar o banco de dados diretamente.
A arquitetura obrigatória é: ROUTER → SERVICE → DB

O QUE PODE FAZER:
✅ Chamar funções de service (ex: inventoryService.createGrupoPrecificacao)
✅ Importar de services (ex: import * as inventoryService from "../services/inventory.service.js")
✅ Usar procedures do tRPC (publicProcedure.query, protectedProcedure.query, etc.)

O QUE NÃO PODE FAZER:
❌ Importar diretamente de ./db, ../db, ../../db
❌ Usar db.*, getDb(), db_conn
❌ Usar connection.query(), conn.query(), pool.query()
❌ Usar tx.insert(), tx.update(), tx.delete(), tx.select(), tx.execute() no router

AÇÃO CORRETA:
Mova a lógica de banco de dados para um service em server/services/
O router deve apenas chamar o service, que então acessa o DB.

Exemplo:
❌ ERRADO (no router):
  const result = await db.insert(pedidos).values(...)

✅ CORRETO (no router):
  const result = await ordersService.createPedido(...)

================================
`);
          violationFound = true;
          break; // Uma violação por linha é suficiente
        }
      }

      if (violationFound) {
        break; // Uma violação por arquivo é suficiente
      }
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`⚠️  Arquivo não encontrado: ${routerPath}`);
    } else {
      console.error(`❌ Erro ao ler ${routerPath}:`, error.message);
      process.exit(1);
    }
  }

  if (violationFound) {
    break; // Parar no primeiro arquivo com violação
  }
}

if (violationFound) {
  console.error("\n❌ Router DB Wall: VIOLAÇÃO DETECTADA\n");
  process.exit(1);
}

console.log("✅ Router DB Wall: OK — routers protegidos sem DB direto");
