#!/usr/bin/env node

/**
 * BASELINE GUARD - Proteção contra alterações acidentais em schema
 * 
 * Este script verifica se tentativas perigosas estão sendo feitas
 * e bloqueia operações que podem comprometer a baseline congelada.
 */

const fs = require('fs');
const path = require('path');

const BASELINE_FILE = path.join(__dirname, '../../drizzle/BASELINE_LOCKED.md');
const SCHEMA_FILE = path.join(__dirname, '../../drizzle/schema.ts');
const CONFIG_FILE = path.join(__dirname, '../../drizzle.config.ts');

// Cores para output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function error(message) {
  log(`❌ ERRO: ${message}`, RED);
  process.exit(1);
}

function warn(message) {
  log(`⚠️  AVISO: ${message}`, YELLOW);
}

function success(message) {
  log(`✅ ${message}`, GREEN);
}

// Verificar se baseline está ativa
function checkBaselineActive() {
  if (!fs.existsSync(BASELINE_FILE)) {
    error('BASELINE_LOCKED.md não encontrado. O sistema não está em modo baseline.');
  }
  
  const content = fs.readFileSync(BASELINE_FILE, 'utf-8');
  if (!content.includes('STATUS: 🔒 BASELINE LOCKED')) {
    error('Baseline não está em estado LOCKED.');
  }
  
  success('Baseline LOCKED ativo');
}

// Verificar se schema.ts foi alterado sem intenção
function checkSchemaIntegrity() {
  if (!fs.existsSync(SCHEMA_FILE)) {
    error('schema.ts não encontrado.');
  }
  
  const schemaContent = fs.readFileSync(SCHEMA_FILE, 'utf-8');
  
  // Verificar se tem comentário de baseline
  if (!schemaContent.includes('// BASELINE LOCKED v1.0')) {
    warn('schema.ts não tem marca de baseline. Adicione comentário no topo.');
  }
  
  success('schema.ts integro');
}

// Verificar configuração do Drizzle
function checkDrizzleConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    error('drizzle.config.ts não encontrado.');
  }
  
  const configContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
  
  // Verificar se strict mode está ativo
  if (!configContent.includes('strict: true')) {
    error('drizzle.config.ts não tem strict: true. Isso permite inferência de rename!');
  }
  
  success('drizzle.config.ts seguro (strict mode ativo)');
}

// Verificar operações perigosas
function checkDangerousOperations(args) {
  const command = args[0];
  
  if (command === 'introspect') {
    error('❌❌❌ INTROSPECT BLOQUEADO ❌❌❌\n' +
          'O sistema está em modo BASELINE LOCKED.\n' +
          'Introspect automático é PROIBIDO.\n' +
          'Se você realmente precisa fazer introspect:\n' +
          '1. Leia BASELINE_LOCKED.md\n' +
          '2. Entenda as consequências\n' +
          '3. Desative temporariamente o baseline guard\n' +
          '4. Execute manualmente em ambiente de dev');
  }
  
  if (command === 'generate') {
    warn('Você está tentando gerar uma migration.\n' +
         'Lembre-se:\n' +
         '- Revise o SQL gerado antes de aplicar\n' +
         '- Teste em ambiente de dev\n' +
         '- Atualize BASELINE_LOCKED.md após aplicar\n' +
         '- Documente a mudança');
  }
}

// Main
function main() {
  const args = process.argv.slice(2);
  
  log('\n🔒 BASELINE GUARD - Proteção do Schema ERP', YELLOW);
  log('=' .repeat(50), YELLOW);
  
  checkBaselineActive();
  checkSchemaIntegrity();
  checkDrizzleConfig();
  checkDangerousOperations(args);
  
  log('\n' + '='.repeat(50), YELLOW);
  success('Todas as verificações passaram. Operação permitida.');
  log('\n', RESET);
}

main();
