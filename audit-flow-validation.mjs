#!/usr/bin/env node
/**
 * AUDIT: LEO→TOOLS→SERVICES Flow Validation
 * Verifica se o fluxo está respeitando: Router (validação) → Tools/Leo → Services
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTERS_DIR = path.join(__dirname, 'server', 'routers');
const LEO_DIR = path.join(__dirname, 'server', 'leo');
const TOOLS_DIR = path.join(__dirname, 'server', 'tools');
const REPORT_FILE = path.join(__dirname, 'AUDIT_FLOW_VALIDATION.md');

function analyzeRouterFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  
  const analysis = {
    file: fileName,
    hasTrpc: false,
    hasZodValidation: false,
    hasZodParsing: 0,
    hasServiceCalls: [],
    hasRequireTenant: false,
    issues: []
  };

  // Check patterns
  analysis.hasTrpc = /from\s+["'].*trpc["']|protectedProcedure|publicProcedure/.test(content);
  analysis.hasZodValidation = /\.input\(z\./.test(content);
  analysis.hasRequireTenant = /requireTenant|ctx\.tenantId/.test(content);
  
  // Count z.object() which indicates schema validation
  const zodMatches = content.match(/\.input\(z\./g);
  analysis.hasZodParsing = zodMatches ? zodMatches.length : 0;
  
  // Find service calls
  const serviceRegex = /(?:Service|service)\.([\w]+)\(/g;
  let match;
  while ((match = serviceRegex.exec(content)) !== null) {
    analysis.hasServiceCalls.push(match[1]);
  }
  
  // Risk assessment
  if (!analysis.hasTrpc) analysis.issues.push('❌ Não usa tRPC');
  if (!analysis.hasZodValidation) analysis.issues.push('⚠️ Sem validação Zod');
  if (!analysis.hasRequireTenant) analysis.issues.push('⚠️ Sem validação tenantId');
  
  return analysis;
}

function analyzeDirectory(dirPath, extension = '.ts') {
  try {
    return fs.readdirSync(dirPath)
      .filter(f => f.endsWith(extension) && !f.includes('.test.'))
      .map(f => path.join(dirPath, f))
      .map(analyzeRouterFile);
  } catch (e) {
    return [];
  }
}

async function main() {
  console.log('🔍 Validando fluxo LEO→TOOLS→SERVICES...\n');

  const routerResults = analyzeDirectory(ROUTERS_DIR);
  const leoResults = analyzeDirectory(LEO_DIR);

  const allResults = [
    { layer: 'ROUTERS', results: routerResults },
    { layer: 'LEO', results: leoResults }
  ];

  let report = `# AUDIT: LEO→TOOLS→SERVICES FLOW VALIDATION

**Data:** ${new Date().toLocaleString('pt-BR')}

## 📊 RESUMO EXECUTIVO

| Layer | Arquivos | Com Zod | Com tenantId | Status |
|-------|----------|---------|---------|--------|
| Routers | ${routerResults.length} | ${routerResults.filter(r => r.hasZodValidation).length} | ${routerResults.filter(r => r.hasRequireTenant).length} | ⚠️ |
| LEO | ${leoResults.length} | ${leoResults.filter(r => r.hasZodValidation).length} | ${leoResults.filter(r => r.hasRequireTenant).length} | ⚠️ |

## 🔴 CRÍTICOS (Sem validação Zod)

`;

  for (const layer of allResults) {
    const critical = layer.results.filter(r => !r.hasZodValidation && r.issues.length > 0);
    
    if (critical.length === 0) continue;
    
    report += `### ${layer.layer}\n\n`;
    for (const file of critical) {
      report += `❌ **${file.file}**\n`;
      file.issues.forEach(issue => report += `- ${issue}\n`);
      report += `\n`;
    }
  }

  report += `\n## ✅ BOM (Com validação completa)\n\n`;
  
  for (const layer of allResults) {
    const good = layer.results.filter(r => r.hasZodValidation && r.hasRequireTenant);
    
    if (good.length === 0) continue;
    
    report += `### ${layer.layer}\n`;
    good.forEach(f => report += `✓ ${f.file}\n`);
    report += `\n`;
  }

  report += `\n## 📋 MAPA DE FLUXO ESPERADO\n\n`;
  report += `\`\`\`\n`;
  report += `USER REQUEST\n`;
  report += `    ↓\n`;
  report += `ROUTER (tRPC endpoint)\n`;
  report += `    ├─ Validar input com ZOD ✓\n`;
  report += `    ├─ Validar tenantId ✓\n`;
  report += `    ↓\n`;
  report += `TOOLS / LEO Agent\n`;
  report += `    ├─ Processar lógica\n`;
  report += `    ├─ Orquestrar serviços\n`;
  report += `    ↓\n`;
  report += `SERVICES\n`;
  report += `    ├─ Receber dados já validados\n`;
  report += `    ├─ Garantir tenantId check ✓\n`;
  report += `    └─ Executar lógica de negócio\n`;
  report += `\`\`\`\n`;

  report += `\n## 🎯 RECOMENDAÇÕES\n\n`;
  report += `1. **Para cada Router:**\n`;
  report += `   - [ ] Sempre use \`.input(z.object({ ... }))\` para validar entrada\n`;
  report += `   - [ ] Sempre valide tenantId com \`requireTenant(ctx)\`\n`;
  report += `   - [ ] Nunca passe dados não-validados ao Service\n\n`;
  report += `2. **Para cada Service:**\n`;
  report += `   - [ ] Sempre valide tenantId como PRIMEIRA ação\n`;
  report += `   - [ ] Não confie em Type Hints do TypeScript para validação\n`;
  report += `   - [ ] Use \`Payload = Record<string, unknown>\` ao invés de \`any\`\n\n`;

  fs.writeFileSync(REPORT_FILE, report);
  console.log(`✅ Análise de fluxo completa!\n📄 Relatório: ${REPORT_FILE}\n`);
  
  const totalRouters = routerResults.length;
  const withZodRouters = routerResults.filter(r => r.hasZodValidation).length;
  const withTenantRouters = routerResults.filter(r => r.hasRequireTenant).length;
  
  console.log(`📊 ROUTERS:`);
  console.log(`  Total: ${totalRouters}`);
  console.log(`  Com Zod: ${withZodRouters} (${Math.round(withZodRouters/totalRouters*100)}%)`);
  console.log(`  Com tenantId check: ${withTenantRouters} (${Math.round(withTenantRouters/totalRouters*100)}%)`);
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
