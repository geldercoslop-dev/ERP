#!/usr/bin/env node
/**
 * AUDIT: Runtime Validation + Security Check
 * Analisa services em busca de:
 * 1. ANY types
 * 2. Falta de validação
 * 3. Falta de tenant check
 * 4. Fluxo LEO→TOOLS→SERVICES
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICES_DIR = path.join(__dirname, 'server', 'services');
const REPORT_FILE = path.join(__dirname, 'AUDIT_RUNTIME_VALIDATION.md');

// ============ PATTERNS ============
const PATTERNS = {
  anyType: /:\s*any|<any>|as any(?!\[\])/g,
  validationZod: /zod|\.parse\(|\.validate\(|schema/i,
  tenantCheck: /if\s*\(\s*!tenantId\s*\)|tenantId\s*\?\?\s*throw|!tenantId\s*&&\s*throw/,
  exportFunction: /export\s+(async\s+)?function\s+(\w+)/,
  exportConst: /export\s+(const|async function)\s+(\w+)/,
};

// ============ ANALYSIS FUNCTION ============
function analyzeServiceFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  
  const analysis = {
    file: fileName,
    path: filePath,
    anyTypes: [],
    functions: [],
    tenantChecks: 0,
    hasValidation: false,
    riskLevel: 'CRITICAL', // DEFAULT: CRITICAL
    issues: []
  };

  // 1. Count ANY types
  let anyMatch;
  const anyRegex = /as any(?!\[\])|:\s*any(?![A-Za-z])|<any>/g;
  while ((anyMatch = anyRegex.exec(content)) !== null) {
    const line = content.substring(0, anyMatch.index).split('\n').length;
    analysis.anyTypes.push({
      line,
      text: anyMatch[0]
    });
  }

  // 2. Extract functions
  const funcRegex = /export\s+(async\s+)?function\s+(\w+)/g;
  let funcMatch;
  while ((funcMatch = funcRegex.exec(content)) !== null) {
    const line = content.substring(0, funcMatch.index).split('\n').length;
    analysis.functions.push({
      name: funcMatch[2],
      line,
      isAsync: !!funcMatch[1],
      hasTenantCheck: false,
      hasInputValidation: false
    });
  }

  // 3. Check for tenant checks
  analysis.tenantChecks = (content.match(/if\s*\(\s*!tenantId\s*\)|tenantId.*throw|!tenantId\s*&&/g) || []).length;

  // 4. Check for validation patterns
  const hasZod = /import.*zod|from.*zod|z\.string|z\.number|z\.object/i.test(content);
  const hasValidateCall = /\.validate\(|\.parse\(|assertRequired|validateInput|validatePayload/i.test(content);
  analysis.hasValidation = hasZod || hasValidateCall;

  // 5. Risk assessment
  if (analysis.anyTypes.length > 5) analysis.riskLevel = 'CRITICAL';
  else if (analysis.anyTypes.length > 2) analysis.riskLevel = 'HIGH';
  else if (analysis.anyTypes.length > 0) analysis.riskLevel = 'MEDIUM';

  if (!analysis.hasValidation && analysis.functions.length > 0) {
    analysis.riskLevel = 'CRITICAL';
    analysis.issues.push('⚠️ SEM VALIDAÇÃO DE SCHEMA');
  }

  if (analysis.tenantChecks === 0 && analysis.functions.length > 2) {
    analysis.riskLevel = 'CRITICAL';
    analysis.issues.push('⚠️ SEM TENANT CHECK');
  }

  if (analysis.anyTypes.length > 0) {
    analysis.issues.push(`⚠️ ${analysis.anyTypes.length} OCORRÊNCIAS DE ANY TYPE`);
  }

  return analysis;
}

// ============ MAIN ============
async function main() {
  console.log('🔍 Iniciando auditoria de validação runtime...\n');

  const files = fs.readdirSync(SERVICES_DIR)
    .filter(f => f.endsWith('.ts') && !f.includes('.test.'))
    .map(f => path.join(SERVICES_DIR, f));

  const results = files.map(analyzeServiceFile);
  
  // Sort by risk level
  const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  results.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

  // Generate markdown report
  let report = `# AUDIT: RUNTIME VALIDATION + SECURITY

**Data:** ${new Date().toLocaleString('pt-BR')}
**Total Services:** ${results.length}

## 📊 RESUMO EXECUTIVO

`;

  const criticalCount = results.filter(r => r.riskLevel === 'CRITICAL').length;
  const highCount = results.filter(r => r.riskLevel === 'HIGH').length;
  const totalAnyTypes = results.reduce((sum, r) => sum + r.anyTypes.length, 0);
  const totalFunctions = results.reduce((sum, r) => sum + r.functions.length, 0);

  report += `| Métrica | Valor |
|--------|-------|
| Services CRÍTICOS | ${criticalCount} ⛔ |
| Services HIGH RISK | ${highCount} ⚠️ |
| Total ANY Types | ${totalAnyTypes} |
| Total Funções | ${totalFunctions} |
| Sem Validação | ${results.filter(r => !r.hasValidation).length} |
| Sem Tenant Check | ${results.filter(r => r.tenantChecks === 0).length} |

## 🔴 CRÍTICOS (SEM VALIDAÇÃO + ANY TYPES)

`;

  const critical = results.filter(r => r.riskLevel === 'CRITICAL');
  for (const service of critical) {
    report += `### ❌ ${service.file}\n`;
    if (service.issues.length > 0) {
      report += `**Problemas:**\n`;
      service.issues.forEach(issue => report += `- ${issue}\n`);
    }
    if (service.anyTypes.length > 0) {
      report += `\n**ANY Types (${service.anyTypes.length}):**\n\`\`\`\n`;
      service.anyTypes.slice(0, 5).forEach(any => {
        report += `  Linha ${any.line}: ${any.text}\n`;
      });
      if (service.anyTypes.length > 5) report += `  ... +${service.anyTypes.length - 5} mais\n`;
      report += `\`\`\`\n`;
    }
    report += `\n`;
  }

  report += `\n## 🟡 HIGH RISK\n\n`;
  const high = results.filter(r => r.riskLevel === 'HIGH');
  for (const service of high) {
    report += `### ⚠️ ${service.file}\n`;
    if (service.issues.length > 0) {
      service.issues.forEach(issue => report += `- ${issue}\n`);
    }
    report += `\n`;
  }

  report += `\n## 📋 TODOS OS SERVICES (DETALHADO)\n\n`;
  
  for (const service of results) {
    const icon = { CRITICAL: '❌', HIGH: '⚠️', MEDIUM: '🟡', LOW: '✅' }[service.riskLevel];
    report += `${icon} **${service.file}** [${service.riskLevel}]\n`;
    report += `- Funções: ${service.functions.length}\n`;
    report += `- ANY Types: ${service.anyTypes.length}\n`;
    report += `- Tenant Checks: ${service.tenantChecks}\n`;
    report += `- Tem Validação: ${service.hasValidation ? 'SIM ✓' : 'NÃO ✗'}\n`;
    report += `\n`;
  }

  report += `\n## 🔍 RECOMENDAÇÕES\n\n`;
  report += `### Tier 1: IMEDIATO (Bloqueador de Produção)\n`;
  report += `${critical.map(s => `- [ ] ${s.file}`).join('\n')}\n\n`;
  report += `### Tier 2: ESTA SPRINT\n`;
  report += `${high.slice(0, 5).map(s => `- [ ] ${s.file}`).join('\n')}\n\n`;

  report += `## 📝 CHECKLIST DE REMEDIAÇÃO\n\n`;
  report += `Para cada service CRÍTICO:\n`;
  report += `1. [ ] Remover ALL \`as any\` → Use tipos específicos\n`;
  report += `2. [ ] Adicionar schema validation (zod ou manual)\n`;
  report += `3. [ ] Garantir \`tenantId\` check em TODA função\n`;
  report += `4. [ ] Garantir fluxo LEO→TOOLS→SERVICES\n`;
  report += `5. [ ] Rodar TypeScript check final\n`;

  fs.writeFileSync(REPORT_FILE, report);
  console.log(`✅ Auditoria completa!\n📄 Relatório: ${REPORT_FILE}\n`);
  
  // Print summary
  console.log(`📊 RESUMO:`);
  console.log(`  🔴 CRÍTICOS: ${criticalCount}`);
  console.log(`  🟡 HIGH RISK: ${highCount}`);
  console.log(`  ANY Types encontrados: ${totalAnyTypes}`);
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
