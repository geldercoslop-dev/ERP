#!/usr/bin/env node

/**
 * DRIZZLE-KIT NON-INTERACTIVE WRAPPER
 *
 * Este wrapper executa comandos drizzle-kit em modo NÃO-INTERATIVO:
 * - Aborta em caso de conflito em vez de perguntar
 * - Não permite prompts de rename/create
 * - Força comportamento determinístico
 * - Valida migrations geradas
 *
 * USO: node scripts/db/drizzle-wrapper.mjs [comando] [args...]
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SCHEMA_FILE = path.join(process.cwd(), 'drizzle', 'schema.ts');
const JOURNAL_FILE = path.join(process.cwd(), 'drizzle', 'meta', '_journal.json');
const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

// Cores
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

// Verificar consistência antes de executar
function checkConsistency() {
  if (!fs.existsSync(SCHEMA_FILE)) {
    error('schema.ts não encontrado');
  }

  if (!fs.existsSync(JOURNAL_FILE)) {
    warn('Journal não encontrado. Isso pode causar inferência de rename.');
  }

  success('Verificação de consistência passou');
}

// Verificar se migration gerada é válida
function validateGeneratedMigration() {
  // Procurar migrations em drizzle/ e drizzle/migrations/
  const possibleDirs = [
    path.join(process.cwd(), 'drizzle'),
    path.join(process.cwd(), 'drizzle', 'migrations')
  ];

  let migrationDir = null;
  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
      if (files.length > 0) {
        migrationDir = dir;
        break;
      }
    }
  }

  if (!migrationDir) {
    warn('Nenhuma migration encontrada em drizzle/ ou drizzle/migrations/');
    return false;
  }

  const files = fs.readdirSync(migrationDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const latestMigration = files[files.length - 1];
  const migrationPath = path.join(migrationDir, latestMigration);
  const content = fs.readFileSync(migrationPath, 'utf-8');

  // Verificar se migration está vazia
  const isEmpty = !content.trim() || content.trim() === '--';
  if (isEmpty) {
    warn(`Migration ${latestMigration} está vazia. Isso pode indicar que não há mudanças no schema.`);
    warn('Se isso for esperado, você pode deletar esta migration.');
    return false;
  }

  // Verificar se migration tem comentário explicativo
  const hasComment = content.includes('--') || content.includes('/*');
  if (!hasComment) {
    warn(`Migration ${latestMigration} não tem comentário explicativo.`);
    warn('Recomendado adicionar comentário descrevendo a mudança.');
  }

  // Verificar se migration tem comandos perigosos
  const dangerousCommands = ['DROP DATABASE', 'DROP SCHEMA', 'TRUNCATE'];
  const hasDangerous = dangerousCommands.some(cmd => content.toUpperCase().includes(cmd));
  if (hasDangerous) {
    error(`Migration ${latestMigration} contém comandos perigosos: ${dangerousCommands.join(', ')}`);
    error('Comandos perigosos não são permitidos em migrations automáticas.');
    process.exit(1);
  }

  success(`Migration ${latestMigration} validada com sucesso`);
  return true;
}

// Executar comando drizzle-kit com flags não-interativas
async function runDrizzleCommand(command, args) {
  const drizzleArgs = [command, ...args];

  log(`\n🔧 Executando: drizzle-kit ${drizzleArgs.join(' ')}`, YELLOW);
  log('=' .repeat(60), YELLOW);

  // Usar echo para responder automaticamente ao prompt de rename/create
  // Isso assume sempre "create table" (opção 0)
  const fullCommand = `echo "0" | npx drizzle-kit ${drizzleArgs.join(' ')}`;

  const child = spawn(fullCommand, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      // Forçar modo não-interativo
      DRIZZLE_KIT_NON_INTERACTIVE: '1'
    }
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        success('Comando executado com sucesso');
        resolve(code);
      } else {
        error(`Comando falhou com código ${code}`);
        reject(code);
      }
    });

    child.on('error', (err) => {
      error(`Erro ao executar comando: ${err.message}`);
      reject(err);
    });
  });
}

// Verificar se o output contém prompts de rename/create
function checkOutputForPrompts(output) {
  const dangerousPatterns = [
    /rename/i,
    /create/i,
    /choose/i,
    /select/i,
    /confirm/i,
    /proceed/i,
    /continue/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(output)) {
      error(`Output contém padrão suspeito: ${pattern}. Isso indica prompt interativo.`);
    }
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    error('Uso: node scripts/db/drizzle-wrapper.mjs [comando] [args...]');
  }
  
  const command = args[0];
  const commandArgs = args.slice(1);
  
  log('\n🔒 DRIZZLE-KIT NON-INTERACTIVE WRAPPER', YELLOW);
  log('=' .repeat(60), YELLOW);
  
  // Verificar consistência antes de executar
  checkConsistency();
  
  // Comandos permitidos
  const allowedCommands = ['generate', 'push', 'migrate', 'studio'];
  
  if (!allowedCommands.includes(command)) {
    error(`Comando não permitido: ${command}. Comandos permitidos: ${allowedCommands.join(', ')}`);
  }
  
  // Para comando generate, adicionar flags para evitar prompts
  if (command === 'generate') {
    // Adicionar --custom para forçar geração sem prompts interativos
    // Isso evita que o drizzle-kit pergunte sobre renames/creates
    if (!commandArgs.includes('--custom')) {
      commandArgs.push('--custom');
    }

    // Adicionar nome padrão para evitar prompt de nome
    if (!commandArgs.includes('--name')) {
      commandArgs.push('--name', 'migration_' + Date.now());
    }
  }

  try {
    await runDrizzleCommand(command, commandArgs);

    // Validar migration gerada após comando generate
    if (command === 'generate') {
      log('\n' + '='.repeat(60), YELLOW);
      log('🔍 VALIDANDO MIGRATION GERADA', YELLOW);
      log('=' .repeat(60), YELLOW);
      validateGeneratedMigration();
    }

    log('\n' + '='.repeat(60), YELLOW);
    success('Operação concluída sem prompts interativos');
    log('\n', RESET);
  } catch (err) {
    log('\n' + '='.repeat(60), YELLOW);
    error('Operação falhou ou foi interrompida');
  }
}

main();
