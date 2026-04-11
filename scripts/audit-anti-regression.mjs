#!/usr/bin/env node

/**
 * BLINDAGEM AUTOMÁTICA ANTI-REGRESSÃO
 * 
 * Este script audita o código base para impedir a reintrodução
 * de padrões proibidos que foram eliminados no hardening estrutural.
 * 
 * ESCOPO AUDITADO:
 * - server/services/**/*.ts
 * - server/leo/**/*.ts  
 * - server/_core/**/*.ts
 * 
 * PADRÕES PROIBIDOS:
 * 1. if (!tenantId) em services de negócio
 * 2. if (!dbConn) em services de negócio
 * 3. throw new Error() para erro estrutural de tenant/db/infra
 * 4. fallback silencioso estrutural: return [], return null, return false, return {}
 * 5. catch { return ... } mascarando falha estrutural
 * 
 * EXCLUSÕES:
 * - arquivos de config, validators, tipos, docs, testes
 * - implementações dentro de assertions.ts
 * - definições de erro tipado
 * - exemplos/documentação
 * - contratos auxiliares legítimos fora do fluxo estrutural
 */

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

// Configuração
const CONFIG = {
  patterns: [
    'server/services/**/*.ts',
    'server/leo/**/*.ts',
    'server/_core/**/*.ts'
  ],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.d.ts',
    '**/assertions.ts',
    '**/app-error.ts',
    '**/typed-errors.ts',
    '**/validators/**',
    '**/types/**',
    '**/test*/**',
    '**/docs/**',
    '**/*.test.ts',
    '**/*.spec.ts'
  ]
};

// Padrões proibidos com suas regras
const FORBIDDEN_PATTERNS = [
  {
    name: 'VALIDAÇÃO MANUAL TENANT_ID',
    pattern: /if\s*\(\s*!\s*tenantId\s*\)\s*\{/g,
    message: 'Validação manual de tenantId detectada - usar assertTenantId()',
    contextLines: 2
  },
  {
    name: 'VALIDAÇÃO MANUAL DB_CONN',
    pattern: /if\s*\(\s*!\s*dbConn\s*\)\s*\{/g,
    message: 'Validação manual de dbConn detectada - usar assertDbConnection()',
    contextLines: 2
  },
  {
    name: 'THROW GENÉRICO TENANT',
    pattern: /throw\s+new\s+Error\s*\(\s*["']tenant/i,
    message: 'Throw genérico de tenantId detectado - usar ValidationError',
    contextLines: 2
  },
  {
    name: 'THROW GENÉRICO DATABASE',
    pattern: /throw\s+new\s+Error\s*\(\s*["'][^"']*database/i,
    message: 'Throw genérico de database detectado - usar InfrastructureError',
    contextLines: 2
  },
  {
    name: 'FALLBACK SILENCIOSO ARRAY',
    pattern: /return\s*\[\s*\]\s*;?\s*$/gm,
    message: 'Fallback silencioso de array detectado - usar contrato explícito',
    contextLines: 2
  },
  {
    name: 'FALLBACK SILENCIOSO NULL',
    pattern: /return\s+null\s*;?\s*$/gm,
    message: 'Fallback silencioso de null detectado - usar contrato explícito',
    contextLines: 2
  },
  {
    name: 'FALLBACK SILENCIOSO FALSE',
    pattern: /return\s+false\s*;?\s*$/gm,
    message: 'Fallback silencioso de false detectado - usar contrato explícito',
    contextLines: 2
  },
  {
    name: 'FALLBACK SILENCIOSO OBJECT',
    pattern: /return\s*\{\s*\}\s*;?\s*$/gm,
    message: 'Fallback silencioso de objeto detectado - usar contrato explícito',
    contextLines: 2
  },
  {
    name: 'CATCH MASCARANDO FALHA',
    pattern: /catch\s*\([^)]*\)\s*\{\s*return\s+/g,
    message: 'Catch mascarando falha estrutural detectado - não usar return em catch estrutural',
    contextLines: 3
  }
];

// Função principal de auditoria
function auditAntiRegression() {
  console.log('🔍 INICIANDO AUDITORIA ANTI-REGRESSÃO...\n');
  
  let totalViolations = 0;
  const violationsByFile = {};
  
  // Encontrar todos os arquivos no escopo
  const files = [];
  for (const pattern of CONFIG.patterns) {
    const matchedFiles = globSync(pattern, {
      ignore: CONFIG.exclude,
      absolute: true
    });
    files.push(...matchedFiles);
  }
  
  // Remover duplicados
  const uniqueFiles = [...new Set(files)];
  
  console.log(`📁 Arquivos auditados: ${uniqueFiles.length}`);
  
  // Auditar cada arquivo
  for (const filePath of uniqueFiles) {
    const violations = auditFile(filePath);
    if (violations.length > 0) {
      violationsByFile[filePath] = violations;
      totalViolations += violations.length;
    }
  }
  
  // Gerar relatório
  generateReport(violationsByFile, totalViolations);
  
  // Retornar código de saída
  return totalViolations > 0 ? 1 : 0;
}

// Auditar um arquivo específico
function auditFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const violations = [];
    
    for (const forbidden of FORBIDDEN_PATTERNS) {
      let match;
      const regex = new RegExp(forbidden.pattern);
      
      while ((match = regex.exec(content)) !== null) {
        const lineNumber = getLineNumber(content, match.index);
        const context = getContext(lines, lineNumber, forbidden.contextLines);
        
        // Verificar se é falso positivo (implementação de assert)
        if (isFalsePositive(filePath, lineNumber, lines[lineNumber - 1], forbidden.name)) {
          continue;
        }
        
        violations.push({
          pattern: forbidden.name,
          line: lineNumber,
          column: match.index - content.lastIndexOf('\n', match.index - 1),
          message: forbidden.message,
          context: context
        });
      }
    }
    
    return violations;
  } catch (error) {
    console.error(`❌ Erro ao auditar arquivo ${filePath}:`, error.message);
    return [];
  }
}

// Obter número da linha a partir do índice
function getLineNumber(content, index) {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

// Obter contexto da violação
function getContext(lines, lineNumber, contextLines) {
  const start = Math.max(0, lineNumber - contextLines);
  const end = Math.min(lines.length, lineNumber + contextLines);
  
  const context = [];
  for (let i = start; i < end; i++) {
    const prefix = i === lineNumber - 1 ? '>>> ' : '    ';
    context.push(`${prefix}${i + 1}: ${lines[i]}`);
  }
  
  return context.join('\n');
}

// Verificar se é falso positivo
function isFalsePositive(filePath, lineNumber, lineContent, patternName) {
  // Implementações de asserts são permitidas
  if (filePath.includes('assertions.ts') && 
      (patternName.includes('TENANT_ID') || patternName.includes('DB_CONN'))) {
    return true;
  }
  
  // Definições de erro tipado são permitidas
  if ((filePath.includes('app-error.ts') || filePath.includes('typed-errors.ts')) &&
      patternName.includes('THROW')) {
    return true;
  }
  
  // Comentários são permitidos
  if (lineContent.trim().startsWith('//') || lineContent.trim().startsWith('*')) {
    return true;
  }
  
  // Strings em contexto de negócio (não validação)
  if (patternName.includes('THROW') && 
      (lineContent.includes('inválido') || 
       lineContent.includes('não encontrado') || 
       lineContent.includes('obrigatório'))) {
    // Verificar se é erro de domínio, não estrutural
    if (!lineContent.includes('tenantId') && !lineContent.includes('Database')) {
      return true;
    }
  }
  
  return false;
}

// Gerar relatório
function generateReport(violationsByFile, totalViolations) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 RELATÓRIO DE AUDITORIA ANTI-REGRESSÃO');
  console.log('='.repeat(80));
  
  if (totalViolations === 0) {
    console.log('✅ NENHUMA VIOLAÇÃO ENCONTRADA');
    console.log('✅ O código está em conformidade com as regras de hardening estrutural');
    console.log('='.repeat(80));
    return;
  }
  
  console.log(`❌ ${totalViolations} VIOLAÇÕES ENCONTRADAS`);
  console.log('='.repeat(80));
  
  for (const [filePath, violations] of Object.entries(violationsByFile)) {
    console.log(`\n📄 ARQUIVO: ${path.relative(process.cwd(), filePath)}`);
    console.log('-'.repeat(60));
    
    for (const violation of violations) {
      console.log(`\n🚨 ${violation.pattern}`);
      console.log(`   Linha: ${violation.line}`);
      console.log(`   Mensagem: ${violation.message}`);
      console.log(`   Contexto:\n${violation.context}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📋 RESUMO DAS VIOLAÇÕES POR PADRÃO:');
  
  const summary = {};
  for (const violations of Object.values(violationsByFile)) {
    for (const violation of violations) {
      summary[violation.pattern] = (summary[violation.pattern] || 0) + 1;
    }
  }
  
  for (const [pattern, count] of Object.entries(summary)) {
    console.log(`   ${pattern}: ${count} ocorrência(s)`);
  }
  
  console.log('='.repeat(80));
  console.log('⚠️  CORREÇÕES NECESSÁRIAS:');
  console.log('   1. Substituir validações manuais por asserts reutilizáveis');
  console.log('   2. Usar erros tipados (ValidationError, InfrastructureError)');
  console.log('   3. Implementar contratos explícitos em vez de fallbacks silenciosos');
  console.log('   4. Não mascarar falhas estruturais em catches');
  console.log('='.repeat(80));
}

// Executar auditoria
const exitCode = auditAntiRegression();
process.exit(exitCode);
