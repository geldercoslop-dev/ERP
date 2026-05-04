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

// Janela controlada C3.1 - arquivos _core autorizados para remoção de DB direto
const AUTHORIZED_C3_CORE_FILES = [
  'server/_core/domain-audit.ts',
  'server/_core/oauth.ts',
  'server/_core/ownership.ts',
  'server/_core/sdk.ts',
  'server/_core/service-actor.ts',
];

// Janela formal P23-B - Schema produto_skus autorizado
const P23_B_AUTHORIZED_FILES = [
  'drizzle/schema.ts',
  'drizzle/relations.ts',
  'shared/types/entities.d.ts',
  'drizzle/meta/_journal.json',
  'drizzle/0005_needy_microchip.sql',
  'drizzle/meta/0005_snapshot.json',
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
 * Verifica se arquivo tem autorização P20.4 para update de caminho doc
 * Requer variável ERP_AUTHORIZED_FROZEN_DOC_UPDATE=P20_4_ENV_RULES_PATH_UPDATE
 */
function isP20_4AuthorizedFrozenDocUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P20_4_ENV_RULES_PATH_UPDATE';
  const envValue = process.env.ERP_AUTHORIZED_FROZEN_DOC_UPDATE;
  
  if (relativePath === 'server/_core/env/ENV_RULES.md' && envValue === authorizedValue) {
    return { authorized: true, reason: 'P20.4 formal window: ERP_AUTHORIZED_FROZEN_DOC_UPDATE=' + authorizedValue };
  }
  
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-B para schema produto_skus
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_B_PRODUCT_SKU_SCHEMA
 * Permite somente os 6 arquivos específicos da P23-B
 */
function isP23_BAuthorizedSchemaUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_B_PRODUCT_SKU_SCHEMA';
  const envValue = process.env.ERP_AUTHORIZED_SCHEMA_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_B_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-B formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=' + authorizedValue + ' (product sku schema)'
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-E para limpeza do journal Drizzle
 * Requer variável ERP_AUTHORIZED_JOURNAL_UPDATE=P23_E_REMOVE_ORPHAN_JOURNAL_ENTRY
 * Permite somente drizzle/meta/_journal.json
 */
function isP23_EAuthorizedJournalUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_E_REMOVE_ORPHAN_JOURNAL_ENTRY';
  const envValue = process.env.ERP_AUTHORIZED_JOURNAL_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo é exatamente o journal
  if (relativePath === 'drizzle/meta/_journal.json') {
    return {
      authorized: true,
      reason: 'P23-E formal window: ERP_AUTHORIZED_JOURNAL_UPDATE=' + authorizedValue + ' (remove orphan drizzle journal entry)'
    };
  }

  // Arquivo fora do escopo: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-E para bootstrap DB-only migrate runner
 * Requer variável ERP_AUTHORIZED_BOOTSTRAP_UPDATE=P23_E_MIGRATE_RUNNER_DB_ONLY
 * Permite somente server/_core/bootstrap.ts e server/scripts/run-migrate.ts
 */
function isP23_EAuthorizedBootstrapUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_E_MIGRATE_RUNNER_DB_ONLY';
  const envValue = process.env.ERP_AUTHORIZED_BOOTSTRAP_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (relativePath === 'server/_core/bootstrap.ts' || relativePath === 'server/scripts/run-migrate.ts') {
    return {
      authorized: true,
      reason: 'P23-E formal window: ERP_AUTHORIZED_BOOTSTRAP_UPDATE=' + authorizedValue + ' (migrate runner DB-only bootstrap)'
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

// Janela formal P23-G1 - Limpeza de types de produtoVariacoes autorizada
const P23_G1_AUTHORIZED_FILES = [
  'shared/types/entities.d.ts',
  'server/services/inventory.service.ts',
];

// Janela formal P23-G2.1-B - Schema sku_id em itens_pedido autorizado
const P23_G21_AUTHORIZED_FILES = [
  'drizzle/schema.ts',
  'drizzle/relations.ts',
  'drizzle/meta/_journal.json',
  'drizzle/0006_migration_1777933000000.sql',
  'drizzle/meta/0006_snapshot.json',
  'server/_core/migration-guard.ts',
];

/**
 * Verifica se arquivo tem autorização P23-G1 para limpeza de types de product variations
 * Requer variável ERP_AUTHORIZED_TYPES_UPDATE=P23_G1_REMOVE_PRODUCT_VARIATIONS_TYPES
 * Permite somente:
 *   - shared/types/entities.d.ts
 *   - server/services/inventory.service.ts
 */
function isP23_G1AuthorizedTypesCleanup(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_G1_REMOVE_PRODUCT_VARIATIONS_TYPES';
  const envValue = process.env.ERP_AUTHORIZED_TYPES_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_G1_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-G1 formal window: ERP_AUTHORIZED_TYPES_UPDATE=' + authorizedValue + ' (remove obsolete product variations references)'
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-G2.1-B para adicionar sku_id em itens_pedido
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_G21_ADD_SKU_ID_TO_ITENS_PEDIDO
 * Permite somente os 6 arquivos específicos da P23-G2.1-B:
 *   - drizzle/schema.ts
 *   - drizzle/relations.ts
 *   - drizzle/meta/_journal.json
 *   - drizzle/0006_migration_1777933000000.sql
 *   - drizzle/meta/0006_snapshot.json
 *   - server/_core/migration-guard.ts
 */
function isP23_G21AuthorizedSchemaUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_G21_ADD_SKU_ID_TO_ITENS_PEDIDO';
  const envValue = process.env.ERP_AUTHORIZED_SCHEMA_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_G21_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-G2.1-B formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=' + authorizedValue + ' (add sku_id nullable to itens_pedido + migration guard prefix/hash)'
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se um arquivo está em área congelada
 */
function isFrozen(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  
  // Verifica janela formal P20.4 primeiro
  const p20_4Check = isP20_4AuthorizedFrozenDocUpdate(file);
  if (p20_4Check.authorized) {
    return { frozen: false, exception: true, p20_4: p20_4Check.reason };
  }
  
  // Verifica janela formal P23-B (schema produto_skus)
  const p23_bCheck = isP23_BAuthorizedSchemaUpdate(file);
  if (p23_bCheck.authorized) {
    return { frozen: false, exception: true, p23_b: p23_bCheck.reason };
  }

  // Verifica janela formal P23-E (limpeza do journal drizzle)
  const p23_eCheck = isP23_EAuthorizedJournalUpdate(file);
  if (p23_eCheck.authorized) {
    return { frozen: false, exception: true, p23_e: p23_eCheck.reason };
  }

  // Verifica janela formal P23-E (bootstrap DB-only migrate runner)
  const p23_e_bootstrapCheck = isP23_EAuthorizedBootstrapUpdate(file);
  if (p23_e_bootstrapCheck.authorized) {
    return { frozen: false, exception: true, p23_e_bootstrap: p23_e_bootstrapCheck.reason };
  }

  // Verifica janela formal P23-G1 (limpeza de types de product variations)
  const p23_g1Check = isP23_G1AuthorizedTypesCleanup(file);
  if (p23_g1Check.authorized) {
    return { frozen: false, exception: true, p23_g1: p23_g1Check.reason };
  }

  // Verifica janela formal P23-G2.1-B (adicionar sku_id em itens_pedido)
  const p23_g21Check = isP23_G21AuthorizedSchemaUpdate(file);
  if (p23_g21Check.authorized) {
    return { frozen: false, exception: true, p23_g21: p23_g21Check.reason };
  }

  // Verifica exceções padrão
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
 * Verifica se alteração em server/security/rbac.ts é permitida (exceção restrita)
 * Só permite limpeza de tipagem (any -> PermissionContext)
 * Bloqueia qualquer alteração de lógica, novas permissões ou acesso ao DB
 */
function isRbacTypingCleanupAllowed(file) {
  if (relative(ROOT, file).replace(/\\/g, '/') !== 'server/security/rbac.ts') return { allowed: false };
  try {
    const diff = execSync('git diff --cached -- server/security/rbac.ts', { encoding: 'utf-8', cwd: ROOT });
    if (!diff.trim()) return { allowed: true, reason: 'no-change' };
    const additions = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const removals = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
    
    // Bloqueia DB, lógica, bypass, novas roles/permissões
    const forbidden = additions.find(l => 
      l.match(/db\.|getDb|getPool|query\(|execute\(|bypass|resource:|action:|const|let|var|if|return|switch|case|this\./) ||
      (l.trim().length > 1 && !l.includes('PermissionContext') && !l.match(/^\+\s*(\w+\?: number;|}|\]|,|\[|\s*)$/))
    );

    if (forbidden) return { allowed: false, message: `Bloqueado em rbac.ts: ${forbidden.trim()}` };
    
    const isCleanup = removals.some(l => l.includes('any')) && additions.some(l => l.includes('PermissionContext'));
    if (isCleanup) {
      return { allowed: true, reason: 'rbac-typing-cleanup', message: 'server/security/rbac.ts permitido apenas para RBAC typing cleanup.' };
    }
    return { allowed: false, message: 'server/security/rbac.ts: alteração deve remover "any" e usar "PermissionContext"' };
  } catch (e) { return { allowed: false, message: 'Não foi possível analisar o diff de rbac.ts' }; }
}

/**
 * Verifica se um arquivo está na lista de arquivos autorizados C3.1
 */
function isC3AuthorizedFile(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  return AUTHORIZED_C3_CORE_FILES.includes(relativePath);
}

/**
 * Analisa linhas adicionadas no diff staged de um arquivo
 * Retorna lista de padrões proibidos encontrados nas adições
 */
function findForbiddenC3Additions(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  try {
    const diff = execSync(`git diff --cached -- "${relativePath}"`, {
      encoding: 'utf-8',
      cwd: ROOT,
    });

    if (!diff.trim()) return [];

    const forbiddenFound = [];
    const lines = diff.split('\n');

    for (const line of lines) {
      // Analisa apenas linhas adicionadas (começam com +, mas não +++ do header)
      if (line.startsWith('+') && !line.startsWith('+++')) {
        for (const pattern of C3_FORBIDDEN_ADDITION_PATTERNS) {
          if (line.includes(pattern)) {
            forbiddenFound.push({ pattern, line: line.substring(1).trim() });
          }
        }
      }
    }

    return forbiddenFound;
  } catch (error) {
    // Se não conseguir analisar o diff, bloqueia por segurança
    return [{ pattern: 'diff-analysis-failed', line: 'não foi possível analisar o diff' }];
  }
}

/**
 * Mostra mensagem de violação da janela C3.1
 */
function showC3ViolationMessage(file, forbiddenItems) {
  console.error('\n🚫 CONTRATO DE ARQUITETURA VIOLADO - JANELA C3.1');
  console.error('\nArquivo permitido pela janela C3.1 somente para remover DB direto. Nova violação detectada.\n');
  console.error(`Arquivo: ${file}`);
  console.error('Padrões proibidos encontrados nas adições:');
  for (const item of forbiddenItems) {
    console.error(`  ❌ ${item.pattern} → ${item.line}`);
  }
  console.error('');
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
      
      // Exceção especial para rbac.ts: RBAC typing cleanup
      if (relativePath === 'server/security/rbac.ts') {
        const rbacCheck = isRbacTypingCleanupAllowed(file);
        if (rbacCheck.allowed) {
          console.log(`✅ ${file} (permitido: ${rbacCheck.reason})`);
          continue;
        } else {
          violations.push({ 
            file, 
            pattern: result.pattern, 
            packageReason: rbacCheck.reason,
            packageMessage: rbacCheck.message 
          });
          console.log(`🚫 ${file} (área congelada - ${rbacCheck.message})`);
          continue;
        }
      }
      
      // Verifica janela controlada C3.1
      if (isC3AuthorizedFile(file)) {
        const forbiddenItems = findForbiddenC3Additions(file);
        if (forbiddenItems.length > 0) {
          violations.push({ file, pattern: 'c3-forbidden-addition', c3ForbiddenItems: forbiddenItems });
          showC3ViolationMessage(file, forbiddenItems);
          console.log(`🚫 ${file} (C3.1: nova violação DB detectada)`);
        } else {
          console.log(`✅ ${file} (C3.1: autorizado, sem novas violações DB)`);
        }
      } else if (result.exception === 'drizzle-check-required') {
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
