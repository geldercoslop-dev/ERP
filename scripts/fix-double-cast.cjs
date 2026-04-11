const fs = require('fs');
const path = require('path');

// Lista de arquivos com DOUBLE_CAST
const doubleCastFiles = [
  'server/cache/api-cache.ts',
  'server/db/core.ts',
  'server/leo/actions/desktop-automation-config.ts',
  'server/leo/actions/leo-actions.ts',
  'server/leo/agent/tool-registry.ts',
  'server/leo/memory/leo-events.ts',
  'server/middleware/auth.middleware.ts',
  'server/monitoring/advanced-monitoring.ts',
  'server/queue/jobs.ts',
  'server/routers/leo-admin-dashboard.ts',
  'server/routers/produtos.router.ts',
  'server/routers.ts',
  'server/services/analytics-optimizer.ts',
  'server/services/assistant/assistant.service.ts',
  'server/services/bootstrap.service.ts',
  'server/services/core-business-real.test.ts',
  'server/services/db-transaction.ts',
  'server/services/idempotency-command.service.ts',
  'server/services/inventory.service.ts',
  'server/services/safe-stock.ts',
  'server/services/safe-transaction.ts',
  'server/services/schema-runtime-guard.ts',
  'server/tools/client.tool.ts',
  'server/tools/order.tool.ts',
  'server/tools/product.tool.ts',
  'server/_core/db-result.ts',
  'server/_core/service-safety.ts',
  'server/_core/trace-middleware.ts'
];

let fixedCount = 0;
let typeGuardsCreated = new Set();

doubleCastFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${filePath} - arquivo não encontrado`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Encontrar todos os as unknown as patterns
  const doubleCastPattern = /(\w+)\s+as unknown as\s+([A-Z]\w+)/g;
  let match;

  while ((match = doubleCastPattern.exec(content)) !== null) {
    const [fullMatch, varName, targetType] = match;
    const typeGuardName = `is${targetType}`;
    
    // Criar type guard se não existir
    if (!typeGuardsCreated.has(targetType)) {
      typeGuardsCreated.add(targetType);
      
      // Adicionar type guard no início do arquivo
      const typeGuard = `
// Type guard para ${targetType}
function ${typeGuardName}(obj: unknown): obj is ${targetType} {
  return typeof obj === 'object' && obj !== null;
}
`;
      
      // Encontrar posição para inserir após imports
      const importEndMatch = content.match(/^(import[^;]+;\s*)+$/m);
      if (importEndMatch) {
        content = content.replace(importEndMatch[0], importEndMatch[0] + typeGuard);
        modified = true;
      }
    }

    // Substituir o double cast por type guard validation
    const validationPattern = `if (!${typeGuardName}(${varName})) {
  throw new ValidationError("Invalid ${targetType.toLowerCase()}");
}
const validated${targetType} = ${varName};`;
    
    content = content.replace(fullMatch, validationPattern);
    modified = true;
  }

  // Adicionar import ValidationError se necessário
  if (modified && !content.includes('ValidationError')) {
    const importMatch = content.match(/^import .+ from .+$/m);
    if (importMatch) {
      const importLine = importMatch[0];
      const depth = (filePath.match(/\//g) || []).length - 1;
      const relativePath = '../'.repeat(Math.max(1, depth - 1)) + '_core/errors/typed-errors.js';
      const adjustedImport = `import { ValidationError } from '${relativePath}';`;
      
      content = content.replace(importLine, importLine + '\n' + adjustedImport);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    fixedCount++;
    console.log(`[FIXED] ${filePath} - double casts removidos`);
  } else {
    console.log(`[OK] ${filePath} - sem correções necessárias`);
  }
});

console.log(`\nType Guards Criados: ${typeGuardsCreated.size}`);
console.log(`FASE 3 CONCLUÍDA: ${fixedCount} arquivos corrigidos`);
