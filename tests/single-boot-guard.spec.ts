import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Guard: single-boot de server/_core/index.ts
 *
 * Problema corrigido (P23-R-10C): o módulo exportava startServer() e ainda
 * executava startServer().catch(...) em top-level. Qualquer import do módulo
 * (server/index.ts, server/cluster.ts, testes, tooling) disparava um boot
 * inteiro — double boot e listeners duplicados.
 *
 * Este spec prova, de forma determinística, via análise estrutural do código:
 *  1. nenhuma chamada de startServer() existe em top-level → importar o módulo
 *     NÃO inicia o servidor;
 *  2. nenhum server.listen() existe em top-level → importar o módulo NÃO abre
 *     socket;
 *  3. startServer continua exportado como função → contrato público preservado;
 *  4. o entrypoint oficial (server/index.ts) continua chamando startServer
 *     explicitamente → boot real não foi removido.
 */

const CORE_INDEX_PATH = path.resolve(
  __dirname,
  "..",
  "server",
  "_core",
  "index.ts",
);
const SERVER_ENTRY_PATH = path.resolve(
  __dirname,
  "..",
  "server",
  "index.ts",
);

/** Remove comentários e literais de string para análise estrutural segura. */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1") // line comments (fora de strings simples)
    .replace(/`(?:[^`\\]|\\.)*`/g, "``") // template literals → vazio
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''") // single-quoted strings
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""'); // double-quoted strings
}

/**
 * Linhas de código que estão em top-level (profundidade de chaves = 0),
 * ou seja, executadas imediatamente quando o módulo é importado.
 */
function topLevelLines(source: string): string[] {
  const clean = stripCommentsAndStrings(source);
  const lines = clean.split(/\r?\n/);
  const topLevel: string[] = [];
  let depth = 0;

  for (const line of lines) {
    if (depth === 0) {
      topLevel.push(line);
    }
    for (const ch of line) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
    }
  }
  return topLevel;
}

describe("single-boot guard — server/_core/index.ts", () => {
  const source = fs.readFileSync(CORE_INDEX_PATH, "utf-8");
  const topLevel = topLevelLines(source).join("\n");

  it("não executa startServer() em top-level (import não inicia o servidor)", () => {
    // Chamadas bare: startServer( sem preceder de "function ", "async function " ou identificador
    const bareCalls = topLevel.match(
      /(?<![\w$])(?:await\s+)?startServer\s*\(/g,
    );
    expect(bareCalls).toBeNull();
  });

  it("não chama server.listen() em top-level (import não abre socket)", () => {
    const listenCalls = topLevel.match(/(?<![\w$])server\.listen\s*\(/g);
    expect(listenCalls).toBeNull();
  });

  it("mantém startServer exportado como função", () => {
    expect(source).toMatch(/export\s+(async\s+)?function\s+startServer\s*\(/);
  });

  it("entrypoint server/index.ts continua chamando startServer explicitamente", () => {
    const entry = fs.readFileSync(SERVER_ENTRY_PATH, "utf-8");
    const entryClean = stripCommentsAndStrings(entry);
    expect(entryClean).toMatch(/(?<![\w$])startServer\s*\(/);
  });
});
