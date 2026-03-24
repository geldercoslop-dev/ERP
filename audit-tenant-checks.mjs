#!/usr/bin/env node
/**
 * AUDIT: Tenant Check Analysis
 * Mapeia quais services validam tenantId corretamente
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICES_DIR = path.join(__dirname, 'server', 'services');
const REPORT_FILE = path.join(__dirname, 'AUDIT_TENANT_CHECKS.md');

function analyzeTenantChecks(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  
  const analysis = {
    file: fileName,
    functions: [],
    hasTenantParam: [],
    missingTenantCheck: []
  };

  // Extract function signatures
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)\s*\(\s*([^)]*)\)/g;
  let match;
  
  while ((match = funcRegex.exec(content)) !== null) {
    const funcName = match[1];
    const params = match[2];
    const lineNum = content.substring(0, match.index).split('\n').length;
    
    const hasTenantParam = /tenantId/.test(params);
    
    if (hasTenantParam) {
      // Check if function validates tenantId within body
      const funcBodyStart = content.indexOf('{', match.index);
      const funcBodyEnd = content.indexOf('\n}\n', funcBodyStart) || content.indexOf('\n}', funcBodyStart);
      const funcBody = content.substring(funcBodyStart, funcBodyEnd);
      
      const hasTenantValidation = /if\s*\(\s*!tenantId\s*\)|if\s*\(\s*!.*tenantId|tenantId\s*===?\s*\(undefined|null|falsy\)|throw.*tenantId/i.test(funcBody);
      
      analysis.hasTenantParam.push({
        name: funcName,
        line: lineNum,
        hasValidation: hasTenantValidation
      });
      
      if (!hasTenantValidation) {
        analysis.missingTenantCheck.push({
          name: funcName,
          line: lineNum
        });
      }
    }
  }

  return analysis;
}

async function main() {
  console.log('🔍 Analisando Tenant Checks...\n');

  const files = fs.readdirSync(SERVICES_DIR)
    .filter(f => f.endsWith('.ts') && !f.includes('.test.'))
    .map(f => path.join(SERVICES_DIR, f));

  const results = files.map(analyzeTenantChecks)
    .filter(r => r.hasTenantParam.length > 0)
    .sort((a, b) => b.missingTenantCheck.length - a.missingTenantCheck.length);

  let report = `# AUDIT: TENANT CHECK VALIDATION

**Data:** ${new Date().toLocaleString('pt-BR')}

## 📊 RESUMO

| Métrica | Valor |
|--------|-------|
| Services com tenantId | ${results.length} |
| Funções com tenantId | ${results.reduce((s, r) => s + r.hasTenantParam.length, 0)} |
| SEM validação tenantId | ${results.reduce((s, r) => s + r.missingTenantCheck.length, 0)} ⛔ |

## 🔴 CRÍTICOS (Com tenantId mas SEM validação)

`;

  const critical = results.filter(r => r.missingTenantCheck.length > 0);
  for (const service of critical) {
    report += `### ❌ ${service.file}\n`;
    report += `**Funções SEM tenant check:**\n`;
    service.missingTenantCheck.forEach(func => {
      report += `- \`${func.name}\` (linha ${func.line})\n`;
    });
    report += `\n`;
  }

  report += `\n## ✅ OK (Validação presente)\n\n`;
  const ok = results.filter(r => r.missingTenantCheck.length === 0);
  for (const service of ok) {
    report += `✓ ${service.file} - ${service.hasTenantParam.length} funções com validação\n`;
  }

  fs.writeFileSync(REPORT_FILE, report);
  console.log(`✅ Análise completa!\n📄 Relatório: ${REPORT_FILE}\n`);
  console.log(`📊 RESUMO:`);
  console.log(`  Services com tenantId: ${results.length}`);
  console.log(`  Sem validação: ${critical.length}`);
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
