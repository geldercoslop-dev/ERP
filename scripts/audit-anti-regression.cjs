#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Configuração
const FAIL_FAST = false; // Set to true para parar na primeira violação crítica
const MAX_EVIDENCES_PER_RULE = 20;

// Diretórios a ignorar
const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.next', 'turbo', 
  '.cache', '.git', 'tmp', 'temp', 'logs', 'backup', 'backups', 
  'audit-evidence', 'backup-fase0'
]);

// Escopo limitado
const SCOPE_DIRS = [
  'server/services',
  'server/leo', 
  'server/_core',
  'server/routes',
  'server/routers'
];

// Extensões aceitas
const ALLOWED_EXTS = new Set(['.ts']);
const IGNORED_FILES = new Set(['.d.ts', '.test.ts', '.spec.ts']);

// Padrões de regressão (simples e diretos)
const REGRESSION_PATTERNS = {
  'FALLBACK_ARRAY': {
    pattern: /return\s*\[\s*\]\s*;?\s*$/,
    message: 'Fallback silencioso de array detectado - usar contrato explícito'
  },
  'FALLBACK_NULL': {
    pattern: /return\s+null\s*;?\s*$/,
    message: 'Fallback silencioso de null detectado - usar contrato explícito'
  },
  'FALLBACK_FALSE': {
    pattern: /return\s+false\s*;?\s*$/,
    message: 'Fallback silencioso de false detectado - usar contrato explícito'
  },
  'FALLBACK_OBJECT': {
    pattern: /return\s*\{\s*\}\s*;?\s*$/,
    message: 'Fallback silencioso de objeto detectado - usar contrato explícito'
  },
  'CATCH_RETURN': {
    pattern: /catch\s*\([^)]*\)\s*\{\s*return\s+/,
    message: 'Catch mascarando falha estrutural detectado - não usar return em catch estrutural'
  },
  'GUARD_TENANT': {
    pattern: /if\s*\(\s*!\s*tenantId\s*\)/,
    message: 'Validação manual de tenantId detectada - usar assertTenantId()'
  },
  'GUARD_DBCONN': {
    pattern: /if\s*\(\s*!\s*dbConn\s*\)/,
    message: 'Validação manual de dbConn detectada - usar assertDbConnection()'
  },
  'GUARD_CONN': {
    pattern: /if\s*\(\s*!\s*conn\s*\)/,
    message: 'Validação manual de conn detectada - usar assertDbConnection()'
  },
  'THROW_GENERIC': {
    pattern: /throw\s+new\s+Error\s*\(/,
    message: 'Throw genérico detectado - usar erro tipado (ValidationError, InfrastructureError)'
  }
};

// Contadores e evidências
const stats = {
  filesAnalyzed: 0,
  violations: {},
  startTime: Date.now()
};

// Verificar se diretório deve ser ignorado
function shouldIgnoreDir(dirName) {
  return IGNORED_DIRS.has(dirName) || dirName.startsWith('.');
}

// Verificar se arquivo deve ser analisado
function shouldAnalyzeFile(filePath) {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath);
  
  return ALLOWED_EXTS.has(ext) && !IGNORED_FILES.has(basename);
}

// Caminhar pelo diretório de forma incremental
function walk(dir) {
  let filesCount = 0;
  
  function traverse(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          if (!shouldIgnoreDir(entry.name)) {
            traverse(fullPath);
          }
        } else if (entry.isFile()) {
          if (shouldAnalyzeFile(fullPath)) {
            scanFile(fullPath);
            filesCount++;
          }
        }
      }
    } catch (error) {
      // Ignorar erros de permissão
    }
  }
  
  traverse(dir);
  return filesCount;
}

// Analisar arquivo individualmente
function scanFile(filePath) {
  stats.filesAnalyzed++;
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      // Verificar cada padrão
      for (const [ruleName, rule] of Object.entries(REGRESSION_PATTERNS)) {
        if (rule.pattern.test(line)) {
          // Verificar se é falso positivo (comentários, strings)
          if (isFalsePositive(line)) {
            continue;
          }
          
          // Inicializar contador se não existir
          if (!stats.violations[ruleName]) {
            stats.violations[ruleName] = {
              count: 0,
              evidences: []
            };
          }
          
          // Incrementar contador
          stats.violations[ruleName].count++;
          
          // Adicionar evidência se ainda não atingiu o limite
          if (stats.violations[ruleName].evidences.length < MAX_EVIDENCES_PER_RULE) {
            stats.violations[ruleName].evidences.push({
              file: path.relative(process.cwd(), filePath),
              line: lineNumber,
              content: line.trim()
            });
          }
          
          // Fail fast se configurado
          if (FAIL_FAST && stats.violations[ruleName].count >= 5) {
            console.log(`\n\nFATAL: Múltiplas violações críticas de ${ruleName} detectadas!`);
            console.log('Parando execução (FAIL_FAST=true)');
            process.exit(1);
          }
        }
      }
    }
  } catch (error) {
    // Ignorar erros de leitura
  }
}

// Verificar se é falso positivo
function isFalsePositive(line) {
  const trimmed = line.trim();
  
  // Ignorar comentários
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return true;
  }
  
  // Ignorar linhas dentro de strings (verificação simples)
  if ((trimmed.match(/"/g) || []).length % 2 === 1 || 
      (trimmed.match(/'/g) || []).length % 2 === 1) {
    return true;
  }
  
  return false;
}

// Gerar relatório
function report() {
  const endTime = Date.now();
  const duration = endTime - stats.startTime;
  const memory = process.memoryUsage();
  
  console.log('\n' + '='.repeat(80));
  console.log('AUDITORIA ANTI-REGRESSÃO ESTRUTURAL');
  console.log('='.repeat(80));
  
  console.log(`\nESTATÍSTICAS:`);
  console.log(`  Arquivos analisados: ${stats.filesAnalyzed}`);
  console.log(`  Duração: ${(duration / 1000).toFixed(2)}s`);
  console.log(`  Memória usada: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  
  const totalViolations = Object.values(stats.violations).reduce((sum, v) => sum + v.count, 0);
  
  if (totalViolations === 0) {
    console.log('\n' + '='.repeat(80));
    console.log('RESULTADO: NENHUMA VIOLAÇÃO ENCONTRADA');
    console.log('O código está em conformidade com as regras de hardening estrutural');
    console.log('='.repeat(80));
    return 0;
  }
  
  console.log(`\nVIOLAÇÕES ENCONTRADAS: ${totalViolations}`);
  console.log('='.repeat(80));
  
  for (const [ruleName, violation] of Object.entries(stats.violations)) {
    const rule = REGRESSION_PATTERNS[ruleName];
    console.log(`\n${ruleName}: ${violation.count} ocorrência(s)`);
    console.log(`  ${rule.message}`);
    
    if (violation.evidences.length > 0) {
      console.log('  Primeiras evidências:');
      violation.evidences.forEach(ev => {
        console.log(`    ${ev.file}:${ev.line} - ${ev.content}`);
      });
      
      if (violation.count > MAX_EVIDENCES_PER_RULE) {
        console.log(`    ... e mais ${violation.count - MAX_EVIDENCES_PER_RULE} ocorrência(s)`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('AÇÕES RECOMENDADAS:');
  console.log('  1. Substituir validações manuais por asserts reutilizáveis');
  console.log('  2. Usar erros tipados (ValidationError, InfrastructureError)');
  console.log('  3. Implementar contratos explícitos em vez de fallbacks silenciosos');
  console.log('  4. Não mascarar falhas estruturais em catches');
  console.log('='.repeat(80));
  
  return 1;
}

// Função principal
function main() {
  console.log('INICIANDO AUDITORIA ANTI-REGRESSÃO (versão low-memory)');
  console.log(`Escopo: ${SCOPE_DIRS.join(', ')}`);
  
  let totalFiles = 0;
  
  // Processar cada diretório no escopo
  for (const scopeDir of SCOPE_DIRS) {
    if (fs.existsSync(scopeDir)) {
      console.log(`Analisando: ${scopeDir}`);
      totalFiles += walk(scopeDir);
    }
  }
  
  console.log(`\nVarredura concluída. ${totalFiles} arquivos encontrados.`);
  
  // Gerar relatório e sair
  const exitCode = report();
  process.exit(exitCode);
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { main };
