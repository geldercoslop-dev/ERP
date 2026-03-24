#!/usr/bin/env node
/**
 * Auditor de performance — analisa logs do servidor capturados durante carga.
 *
 * Uso:
 *   node scripts/http-perf/audit-logs.mjs caminho/para/server.log
 *   type server.log | node scripts/http-perf/audit-logs.mjs
 *   Get-Content server.log | node scripts/http-perf/audit-logs.mjs
 *
 * Saída: ✔ ok | ⚠ lento | ❌ problema (conforme padrões do ERP: TRPC, MySQL pool, etc.)
 *
 * Opções:
 *   --json   imprime também JSON no stderr com contagens
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import { stdin } from "process";

const args = process.argv.slice(2).filter((a) => a !== "--json");
const jsonOut = process.argv.includes("--json");

/** @type {{ id: string, level: 'bad'|'warn', re: RegExp, hint: string }[]} */
const RULES = [
  // ❌ problema — erro, falha dura, inconsistência
  { id: "trpc_onerror", level: "bad", re: /\[TRPC onError\]/i, hint: "Erro tRPC durante request (ver path/sqlMessage)" },
  { id: "pool_fatal", level: "bad", re: /\[Database\]\s*(Unexpected pool error|Failed to create)/i, hint: "Falha grave no pool MySQL" },
  { id: "pool_failed", level: "bad", re: /Database connection pool failed/i, hint: "Pool não subiu" },
  { id: "mysql_codes", level: "bad", re: /\b(ER_LOCK_DEADLOCK|ER_LOCK_WAIT_TIMEOUT|Deadlock|Lock wait timeout)\b/i, hint: "Contenção / deadlock no MySQL" },
  { id: "conn_refused", level: "bad", re: /\bECONNREFUSED\b.*mysql|mysql.*\bECONNREFUSED\b/i, hint: "MySQL inacessível" },
  { id: "too_many_conn", level: "bad", re: /Too many connections|ER_CON_COUNT_ERROR/i, hint: "Limite de conexões MySQL" },
  { id: "uncaught", level: "bad", re: /uncaughtException|unhandledRejection|FATAL/i, hint: "Processo instável" },
  { id: "global_500", level: "bad", re: /Erro global não tratado|Erro interno do servidor/i, hint: "500 no handler Express" },

  // ⚠ lento / gargalo / instabilidade intermitente
  { id: "pool_reconnect", level: "warn", re: /\[Database\]\s*Connection lost\. Attempting to recreate pool/i, hint: "Pool perdeu conexão (rede/DB sob carga)" },
  { id: "mysql_timeout", level: "warn", re: /\b(ETIMEDOUT|PROTOCOL_CONNECTION_LOST)\b/i, hint: "Timeout / conexão caiu (rede ou DB lento)" },
  { id: "slow_hint", level: "warn", re: /slow query|long query|duration:\s*\d{4,}ms|took\s+\d{4,}\s*ms/i, hint: "Indício de query lenta (se habilitado no MySQL/app)" },
  { id: "rate_limit", level: "warn", re: /TOO_MANY_REQUESTS|429|rate.?limit/i, hint: "Rate limit ou proteção brute-force" },
  { id: "db_boot_retry", level: "warn", re: /db_boot_(fail|retry)|db_boot_fatal/i, hint: "Problemas ao subir DB" },
  { id: "createcontext_err", level: "warn", re: /\[createContext\]\s*Erro/i, hint: "Falha ao montar contexto (sessão/headers)" },
];

async function readLines(source) {
  const rl = createInterface({
    input: source,
    crlfDelay: Infinity,
  });
  /** @type {string[]} */
  const lines = [];
  for await (const line of rl) {
    lines.push(line);
  }
  return lines;
}

function audit(lines) {
  /** @type {Record<string, { level: string, count: number, samples: string[] }>} */
  const hits = {};
  for (const r of RULES) {
    hits[r.id] = { level: r.level, count: 0, samples: [] };
  }

  for (const line of lines) {
    for (const r of RULES) {
      if (r.re.test(line)) {
        const h = hits[r.id];
        h.count++;
        if (h.samples.length < 3) h.samples.push(line.slice(0, 400));
      }
    }
  }

  const bad = RULES.filter((r) => r.level === "bad" && hits[r.id].count > 0);
  const warn = RULES.filter((r) => r.level === "warn" && hits[r.id].count > 0);

  return { lines: lines.length, hits, bad, warn, rules: RULES };
}

function printReport(result) {
  const { lines, bad, warn, hits } = result;

  console.log("");
  console.log("## Auditoria de logs (performance / carga)");
  console.log("");
  console.log(`Linhas analisadas: **${lines}**`);
  console.log("");

  console.log("### ✔ ok");
  if (bad.length === 0 && warn.length === 0) {
    console.log("- Nenhum padrão de **❌ problema** nem **⚠ lento/gargalo** encontrado neste arquivo.");
    console.log("- Confirme que o log cobre o período exato do load e o nível de log captura erros do servidor.");
  } else if (bad.length === 0) {
    console.log("- Nenhum padrão crítico (**❌ problema**). Há itens em **⚠** — possível lentidão ou gargalo.");
  } else {
    console.log("- **Não** está ok: existem ocorrências em **❌ problema** (abaixo).");
  }
  console.log("");

  console.log("### ⚠ lento / gargalo / intermitente");
  if (warn.length === 0) {
    console.log("- Nada classificado como aviso.");
  } else {
    for (const r of RULES.filter((x) => x.level === "warn")) {
      const c = hits[r.id].count;
      if (c === 0) continue;
      console.log(`- **${r.id}** (${c}×): ${r.hint}`);
      for (const s of hits[r.id].samples) {
        console.log(`  - \`${s.replace(/`/g, "'")}\``);
      }
    }
  }
  console.log("");

  console.log("### ❌ problema");
  if (bad.length === 0) {
    console.log("- Nenhum padrão crítico encontrado.");
  } else {
    for (const r of RULES.filter((x) => x.level === "bad")) {
      const c = hits[r.id].count;
      if (c === 0) continue;
      console.log(`- **${r.id}** (${c}×): ${r.hint}`);
      for (const s of hits[r.id].samples) {
        console.log(`  - \`${s.replace(/`/g, "'")}\``);
      }
    }
  }
  console.log("");

  console.log("---");
  console.log("*Padrões alinhados a `server/_core/index.ts` (TRPC onError), `server/config/database.ts` (pool), erros MySQL comuns.*");
  console.log("");
}

async function main() {
  const path = args[0];
  let lines;
  if (!path || path === "-") {
    if (stdin.isTTY) {
      console.error("Uso: node audit-logs.mjs <arquivo.log>   ou   cat arquivo.log | node audit-logs.mjs");
      process.exit(2);
    }
    lines = await readLines(stdin);
  } else {
    lines = await readLines(createReadStream(path));
  }

  const result = audit(lines);
  printReport(result);

  if (jsonOut) {
    console.error(JSON.stringify(result, null, 2));
  }

  const hasBad = result.bad.length > 0;
  process.exit(hasBad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
