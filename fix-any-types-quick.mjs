#!/usr/bin/env node
/**
 * Script para remover ANY types rapidamente
 * Substitui padrões comuns de `any` por Record<string, unknown>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILES_TO_FIX = [
  'server/services/leo-insights.service.ts',
  'server/services/safe-transaction.ts',
  'server/services/leo-service.ts',
  'server/services/audit-service.ts',
  'server/services/inventory.service.ts',
  'server/services/clientes.service.ts',
  'server/services/stock-safety.service.ts',
];

function fixAnyTypes(content) {
  // Pattern 1: "data: any" → "data: Record<string, unknown>"
  content = content.replace(/:\s*any(?![A-Za-z_])/g, ': Record<string, unknown>');
  
  // Pattern 2: "as any" → "as Record<string, unknown>" (be careful)
  content = content.replace(/as any(?!\[\])/g, 'as unknown');
  
  // Pattern 3: "<any>" → "<Record<string, unknown>>"
  content = content.replace(/<any>/g, '<Record<string, unknown>>');
  
  // Pattern 4: ": any\[\]" → ": Array<Record<string, unknown>>"
  content = content.replace(/:\s*any\[\]/g, ': Array<unknown>');
  
  // Pattern 5: "(p: any)" → "(p: Record<string, unknown>)"
  content = content.replace(/\(([a-zA-Z]+):\s*any\)/g, '($1: unknown)');
  
  // Pattern 6: clean up duplicates in imports
  content = content.replace(/import.*Record.*Record/g, 'import { Record }');
  
  return content;
}

async function main() {
  console.log('🔄 Removing ANY types from critical services...\n');
  
  let totalFixed = 0;
  
  for (const file of FILES_TO_FIX) {
    // Use file directly as it's already relative to __dirname
    const filePath = path.resolve(file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  ${file} - não encontrado (tentando em ${filePath})`);
      continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    const origLength = content.length;
    
    content = fixAnyTypes(content);
    
    const fixed = origLength - content.length;
    if (fixed > 0) {
      fs.writeFileSync(filePath, content);
      totalFixed += fixed;
      console.log(`✅ ${file} - fixado`);
    }
  }
  
  console.log(`\n✅ Total de caracteres ajustados: ${totalFixed}`);
  console.log('📝 Próximo passo: pnpm exec tsc -p tsconfig.server.json --noEmit');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
