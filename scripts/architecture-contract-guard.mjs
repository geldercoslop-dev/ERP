#!/usr/bin/env node

/**
 * ARCHITECTURE CONTRACT GUARD
 * 
 * Protege áreas congeladas do sistema:
 * BASE + INFRA + SCHEMA + TYPES + GUARD = ESTÁVEL
 * 
 * Evolução deve seguir para domínio (PEDIDOS e outros).
 * Base/infra/schema/types/guard só podem ser alterados com fase autorizada.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();

// Áreas congeladas - não podem ser alteradas sem fase autorizada
const FROZEN_PATTERNS = [
  'server/_core/',
  'server/bootstrap/',
  'server/config/',
  'server/security/',
  'server/db/',
  'drizzle/',
  'migrations/',
  'shared/',
  '.env',
  '.env.',
  'docker-compose',
  'package.json',
  'pnpm-lock.yaml',
];

// Exceções permitidas mesmo em áreas congeladas
const EXCEPTIONS = [
  'drizzle/relations.ts',
  'shared/types/entities.ts',
  'scripts/architecture-contract-guard.mjs',
  'scripts/drizzle-schema-guard.mjs',
  'scripts/guardrail-check.js',
  'scripts/anti-regress-check.js',
  '.github/workflows/ci.yml',
  '.husky/pre-commit',
  '.husky/pre-push',
  'docs/',
];

// Áreas permitidas para evolução (domínio)
const ALLOWED_PATTERNS = [
  'server/services/',
  'server/api/',
  'server/cache/',
  'server/concurrency/',
  'client/',
  'tests/',
  'docs/',
  'scripts/',
];

/**
 * Obtém arquivos alterados (staged ou todos)
 */
function getChangedFiles(staged = true) {
  try {
    const cmd = staged 
      ? 'git diff --cached --name-only --diff-filter=ACM'
      : 'git diff --name-only --diff-filter=ACM';
    const output = execSync(cmd, { encoding: 'utf-8', cwd: ROOT });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Se não for repo git ou não houver mudanças, retorna vazio
    return [];
  }
}

/**
 * Verifica se um arquivo está em área congelada
 */
function isFrozen(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  
  // Verifica exceções primeiro
  for (const exception of EXCEPTIONS) {
    if (relativePath.startsWith(exception) || relativePath === exception) {
      // Exceção especial: relations.ts e entities.ts precisam passar no drizzle-schema-guard
      if (relativePath === 'drizzle/relations.ts' || relativePath === 'shared/types/entities.ts') {
        return { frozen: true, exception: 'drizzle-check-required' };
      }
      return { frozen: false, exception: true };
    }
  }
  
  // Verifica padrões congelados
  for (const pattern of FROZEN_PATTERNS) {
    if (relativePath.startsWith(pattern) || relativePath === pattern) {
      return { frozen: true, pattern };
    }
  }
  
  return { frozen: false };
}

/**
 * Verifica se drizzle-schema-guard passou
 */
function checkDrizzleGuard() {
  try {
    execSync('node scripts/drizzle-schema-guard.mjs', { 
      encoding: 'utf-8', 
      cwd: ROOT,
      stdio: 'pipe'
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Verifica se alteração em package.json é permitida (exceção restrita)
 * Só permite adição do script "guard:router-db-wall"
 * Bloqueia qualquer alteração em dependencies, devDependencies ou outros scripts
 */
function isPackageJsonChangeAllowed(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  
  if (relativePath !== 'package.json') {
    return { allowed: false };
  }
  
  try {
    // Obtém diff do arquivo staged
    const diff = execSync('git diff --cached package.json', { 
      encoding: 'utf-8', 
      cwd: ROOT 
    });
    
    // Se não houver diff, não há problema
    if (!diff.trim()) {
      return { allowed: true, reason: 'no-change' };
    }
    
    // Parse do diff para verificar o que foi alterado
    const lines = diff.split('\n');
    let hasGuardRouterDbWallAddition = false;
    let hasDependencyChange = false;
    let hasDevDependencyChange = false;
    let hasOtherScriptChange = false;
    
    for (const line of lines) {
      // Verifica adição do script guard:router-db-wall
      if (line.includes('+') && line.includes('guard:router-db-wall')) {
        hasGuardRouterDbWallAddition = true;
      }
      
      // Verifica alterações em dependencies
      if (line.includes('dependencies') || line.match(/^\+.*"dependencies"/)) {
        hasDependencyChange = true;
      }
      
      // Verifica alterações em devDependencies
      if (line.includes('devDependencies') || line.match(/^\+.*"devDependencies"/)) {
        hasDevDependencyChange = true;
      }
      
      // Verifica alterações em outros scripts (não guard:router-db-wall)
      if (line.includes('+') && line.includes('"') && line.includes(':') && 
          !line.includes('guard:router-db-wall') && 
          (line.includes('scripts') || line.match(/^\s*\+.*".*":/))) {
        // Verifica se é uma linha de script
        if (line.match(/^\s*\+\s*"[^"]+":\s*"node/)) {
          hasOtherScriptChange = true;
        }
      }
    }
    
    // Verifica se houve alteração em dependencies ou devDependencies (pelas linhas do diff)
    const diffContent = diff.toLowerCase();
    if (diffContent.includes('"dependencies"') && !diffContent.includes('"scripts"')) {
      // Se menciona dependencies mas não está na seção de scripts, bloqueia
      hasDependencyChange = true;
    }
    
    // Verifica se há adição/remoção de pacotes (linhas com +/- e nomes de pacotes)
    for (const line of lines) {
      if (line.match(/^\+.*"[^"]+":\s*"\^/)) {
        // Parece ser uma dependência sendo adicionada
        if (!line.includes('guard:router-db-wall')) {
          hasDependencyChange = true;
        }
      }
    }
    
    // Critérios de bloqueio
    if (hasDependencyChange) {
      return { 
        allowed: false, 
        reason: 'dependency-change',
        message: 'Alteração em dependencies não permitida'
      };
    }
    
    if (hasDevDependencyChange) {
      return { 
        allowed: false, 
        reason: 'dev-dependency-change',
        message: 'Alteração em devDependencies não permitida'
      };
    }
    
    if (hasOtherScriptChange) {
      return { 
        allowed: false, 
        reason: 'other-script-change',
        message: 'Alteração em scripts não relacionados não permitida'
      };
    }
    
    // Se tem a adição do script guard:router-db-wall e nada mais, permite
    if (hasGuardRouterDbWallAddition) {
      return { 
        allowed: true, 
        reason: 'guard-router-db-wall-addition',
        message: 'Adição do script guard:router-db-wall permitida'
      };
    }
    
    // Se não tem a adição do script, bloqueia
    return { 
      allowed: false, 
      reason: 'unauthorized-change',
      message: 'Alteração em package.json não autorizada'
    };
    
  } catch (error) {
    // Se não conseguir analisar o diff, bloqueia por segurança
    return { 
      allowed: false, 
      reason: 'diff-analysis-failed',
      message: 'Não foi possível analisar o diff de package.json'
    };
  }
}

/**
 * Mostra mensagem de erro com orientação
 */
function showViolationMessage(file, pattern, packageMessage = null) {
  console.error('\n🚫 CONTRATO DE ARQUITETURA VIOLADO');
  console.error('\nEstado congelado:');
  console.error('BASE + INFRA + SCHEMA + TYPES + GUARD = ESTÁVEL\n');
  console.error(`Arquivo bloqueado:`);
  console.error(`  ${file}\n`);
  
  if (packageMessage) {
    console.error(`Motivo específico:`);
    console.error(`  ${packageMessage}\n`);
  }
  
  console.error(`Regra:`);
  console.error(`  Base/infra/schema/types/guard só podem ser alterados com fase autorizada.\n`);
  console.error(`Caminho correto:`);
  console.error(`  1. Pare`);
  console.error(`  2. Reporte`);
  console.error(`  3. Peça autorização do arquiteto`);
  console.error(`  4. Não tente corrigir fora do prompt\n`);
}

/**
 * Executa o guard
 */
function runGuard() {
  const args = process.argv.slice(2);
  const staged = !args.includes('--all');
  
  const changedFiles = getChangedFiles(staged);
  
  if (changedFiles.length === 0) {
    console.log('✅ Nenhum arquivo alterado para verificar.');
    process.exit(0);
  }
  
  console.log(`🔍 Verificando ${changedFiles.length} arquivo(s) alterado(s)...`);
  
  let violations = [];
  let drizzleCheckRequired = false;
  
  for (const file of changedFiles) {
    const result = isFrozen(file);
    
    if (result.frozen) {
      // Exceção especial para package.json: verifica se a alteração é permitida
      const relativePath = relative(ROOT, file).replace(/\\/g, '/');
      if (relativePath === 'package.json') {
        const packageCheck = isPackageJsonChangeAllowed(file);
        if (packageCheck.allowed) {
          console.log(`✅ ${file} (permitido: ${packageCheck.reason})`);
          continue;
        } else {
          violations.push({ 
            file, 
            pattern: result.pattern, 
            packageReason: packageCheck.reason,
            packageMessage: packageCheck.message 
          });
          console.log(`🚫 ${file} (área congelada - ${packageCheck.message})`);
          continue;
        }
      }
      
      if (result.exception === 'drizzle-check-required') {
        drizzleCheckRequired = true;
        console.log(`⚠️  ${file} requer verificação do drizzle-schema-guard`);
      } else {
        violations.push({ file, pattern: result.pattern });
        console.log(`🚫 ${file} (área congelada)`);
      }
    } else {
      console.log(`✅ ${file} (permitido)`);
    }
  }
  
  // Se precisa verificar drizzle-guard
  if (drizzleCheckRequired) {
    console.log('\n🔍 Executando drizzle-schema-guard...');
    if (!checkDrizzleGuard()) {
      console.error('\n❌ drizzle-schema-guard falhou. Abortando.');
      process.exit(1);
    }
    console.log('✅ drizzle-schema-guard passou.');
  }
  
  // Se há violações, bloqueia
  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} violação(ões) encontrada(s):\n`);
    for (const violation of violations) {
      showViolationMessage(violation.file, violation.pattern, violation.packageMessage);
      console.error('---');
    }
    process.exit(1);
  }
  
  console.log('\n✅ Architecture Contract Guard: PASSED');
  process.exit(0);
}

// Executa
runGuard();
