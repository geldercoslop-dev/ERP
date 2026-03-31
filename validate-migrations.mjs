#!/usr/bin/env node
/**
 * VALIDATION SCRIPT - Drizzle Migrations Bootstrap
 * 
 * Este script valida que:
 * 1. _journal.json está sincronizado com arquivos SQL
 * 2. Todos os arquivos de migração existem
 * 3. Bootstrap irá funcionar corretamente
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DRIZZLE_DIR = path.join(ROOT, "drizzle");
const JOURNAL_PATH = path.join(DRIZZLE_DIR, "meta", "_journal.json");

console.log("\n🔍 VALIDAÇÃO: Bootstrap Drizzle\n");
console.log(`📁 ROOT: ${ROOT}`);
console.log(`📁 DRIZZLE: ${DRIZZLE_DIR}`);
console.log(`📄 JOURNAL: ${JOURNAL_PATH}\n`);

// 1. Ler _journal.json
console.log("1️⃣  Lendo _journal.json...");
let journal;
try {
  const journalText = fs.readFileSync(JOURNAL_PATH, "utf-8");
  journal = JSON.parse(journalText);
  console.log(`   ✓ ${journal.entries.length} migrações no journal\n`);
} catch (err) {
  console.error(`   ✗ Erro ao ler journal: ${err}`);
  process.exit(1);
}

// 2. Validar que todos os arquivos SQL existem
console.log("2️⃣  Validando arquivos SQL...");
const missingFiles = [];
for (const entry of journal.entries) {
  const tag = entry.tag;
  const filePath = path.join(DRIZZLE_DIR, `${tag}.sql`);
  
  if (!fs.existsSync(filePath)) {
    missingFiles.push(tag);
    console.log(`   ✗ FALTA: ${tag}.sql`);
  }
}

if (missingFiles.length > 0) {
  console.error(`\n   ERRO: ${missingFiles.length} arquivo(s) faltando!\n`);
  process.exit(1);
} else {
  console.log(`   ✓ Todos os ${journal.entries.length} arquivos SQL existem\n`);
}

// 3. Listar arquivos SQL únicos e verificar se há órfãos
console.log("3️⃣  Checando arquivos órfãos...");
const sqlFiles = fs.readdirSync(DRIZZLE_DIR)
  .filter(f => f.endsWith(".sql") && f !== "multi_tenant_migration.sql")
  .map(f => f.replace(".sql", ""));

const journalTags = new Set(journal.entries.map(e => e.tag));
const orphans = sqlFiles.filter(f => !journalTags.has(f));

if (orphans.length > 0) {
  console.warn(`   ⚠️  ORFÃOS: ${orphans.join(", ")}`);
  console.warn(`   (Estes não estão no journal. Considere adicionar se forem válidos)\n`);
} else {
  console.log(`   ✓ Nenhum arquivo órfão\n`);
}

// 4. Validação de estrutura
console.log("4️⃣  Validando estrutura...");
let valid = true;

if (!journal.version || journal.version !== "7") {
  console.error(`   ✗ version inválida: ${journal.version} (esperado 7)`);
  valid = false;
}
if (!journal.dialect || journal.dialect !== "mysql") {
  console.error(`   ✗ dialect inválido: ${journal.dialect} (esperado mysql)`);
  valid = false;
}
if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
  console.error(`   ✗ entries vazio ou inválido`);
  valid = false;
}

// Validar que idx são sequenciais
for (let i = 0; i < journal.entries.length; i++) {
  if (journal.entries[i].idx !== i) {
    console.error(`   ✗ idx não sequencial na posição ${i}: esperado ${i}, obtido ${journal.entries[i].idx}`);
    valid = false;
  }
}

if (!valid) {
  console.error(`\n   ERRO: Estrutura inválida\n`);
  process.exit(1);
} else {
  console.log(`   ✓ Estrutura OK\n`);
}

// 5. Summary
console.log("✅ VALIDAÇÃO PASSOU!\n");
console.log("📊 Summary:");
console.log(`   • Dialect: ${journal.dialect}`);
console.log(`   • Total de migrações: ${journal.entries.length}`);
console.log(`   • Primeira: ${journal.entries[0].tag}`);
console.log(`   • Última: ${journal.entries[journal.entries.length - 1].tag}`);
console.log("\n🚀 O sistema está pronto para boot!\n");

process.exit(0);
