#!/usr/bin/env node
/**
 * AUDIT: ANY Types Detailed List
 * Lista TODOS os ANY types com contexto
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICES_DIR = path.join(__dirname, 'server', 'services');
const REPORT_FILE = path.join(__dirname, 'AUDIT_ANY_TYPES_DETAILED.md');

function getLineWithContext(content, lineNum) {
  const lines = content.split('\n');
  const target = lines[lineNum - 1];
  const before = lines[lineNum - 2] || '';
  const after = lines[lineNum] || '';
  
  return { before, target, after };
}

function listAnyTypes(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  
  const anyMatches = [];
  
  // Pattern 1: ": any"
  const pattern1Regex = /:\s*any(?![A-Za-z_])/g;
  let match;
  while ((match = pattern1Regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    anyMatches.push({
      line: lineNum,
      type: ': any',
      context: getLineWithContext(content, lineNum)
    });
  }
  
  // Pattern 2: "as any"
  const pattern2Regex = /as\s+any(?!\[\])/g;
  while ((match = pattern2Regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    anyMatches.push({
      line: lineNum,
      type: 'as any',
      context: getLineWithContext(content, lineNum)
    });
  }
  
  // Pattern 3: "<any>"
  const pattern3Regex = /<any>/g;
  while ((match = pattern3Regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    anyMatches.push({
      line: lineNum,
      type: '<any>',
      context: getLineWithContext(content, lineNum)
    });
  }
  
  return {
    file: fileName,
    total: anyMatches.length,
    matches: anyMatches.sort((a, b) => a.line - b.line)
  };
}

async function main() {
  console.log('🔍 Listando ALL ANY Types...\n');

  const files = fs.readdirSync(SERVICES_DIR)
    .filter(f => f.endsWith('.ts') && !f.includes('.test.'))
    .map(f => path.join(SERVICES_DIR, f));

  const results = files
    .map(listAnyTypes)
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);

  let report = `# AUDIT: ANY TYPES - LISTA COMPLETA

**Data:** ${new Date().toLocaleString('pt-BR')}
**Total ANY ocorrências:** ${results.reduce((s, r) => s + r.total, 0)}

## 📊 POR SERVICE

`;

  for (const service of results) {
    report += `## ${service.file} ⚠️ (${service.total})\n\n`;
    report += `| Linha | Tipo | Contexto |\n`;
    report += `|------|------|----------|\n`;
    
    for (const match of service.matches) {
      const codeLine = match.context.target.trim().substring(0, 80);
      report += `| ${match.line} | \`${match.type}\` | \`${codeLine}...\` |\n`;
    }
    report += `\n`;
  }

  report += `\n## 📋 SUBSTITUIÇÕES RÁPIDAS\n\n`;
  report += `### Cheat Sheet de Tipos Seguros\n\n`;
  report += `\`\`\`typescript\n`;
  report += `// Ao invés de: any\n`;
  report += `type Payload = Record<string, unknown>;\n`;
  report += `type SafeValue = string | number | boolean | null | undefined;\n`;
  report += `type SafeObject = { [key: string]: unknown };\n`;
  report += `\`\`\`\n`;

  fs.writeFileSync(REPORT_FILE, report);
  console.log(`✅ Lista completa!\n📄 Relatório: ${REPORT_FILE}\n`);
  console.log(`📊 RESUMO:`);
  console.log(`  Total ANY Types: ${results.reduce((s, r) => s + r.total, 0)}`);
  console.log(`  Services afetados: ${results.length}`);
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
