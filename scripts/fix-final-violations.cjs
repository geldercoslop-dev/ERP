const fs = require('fs');
const path = require('path');

// Arquivos críticos que ainda precisam ser corrigidos
const criticalRemaining = [
  'server/config/server-init.ts',
  'server/modules/logistica/carga.service.ts',
  'server/modules/safe-payment.module.ts',
  'server/modules/safe-shipment.module.ts',
  'server/routers.ts',
  'server/resilience/circuit-breaker.ts',
  'server/resilience/failure-simulator.ts',
  'server/resilience/fallback-middleware.ts',
  'server/resilience/query-wrapper.ts',
  'server/resilience/resilience-test.ts',
  'server/resilience/retry-middleware.ts',
  'server/types/database.types.ts'
];

let fixedCount = 0;

criticalRemaining.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${filePath} - arquivo não encontrado`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Adicionar imports necessários
  if (content.includes('throw new Error') && !content.includes('ValidationError') && !content.includes('InfrastructureError')) {
    const isInfra = filePath.includes('resilience') || filePath.includes('infra') || filePath.includes('db');
    const errorType = isInfra ? 'InfrastructureError' : 'ValidationError';
    
    const importMatch = content.match(/^import .+ from .+$/m);
    if (importMatch) {
      const importLine = importMatch[0];
      const depth = (filePath.match(/\//g) || []).length - 1;
      const relativePath = '../'.repeat(Math.max(1, depth - 1)) + '_core/errors/typed-errors.js';
      const adjustedImport = `import { ${errorType} } from '${relativePath}';`;
      
      content = content.replace(importLine, importLine + '\n' + adjustedImport);
      modified = true;
    }
  }

  // Corrigir throw new Error
  const isInfra = filePath.includes('resilience') || filePath.includes('infra') || filePath.includes('db');
  const errorType = isInfra ? 'InfrastructureError' : 'ValidationError';
  
  const throwPattern = /throw new Error\(([^)]+)\)/g;
  if (throwPattern.test(content)) {
    content = content.replace(throwPattern, `throw new ${errorType}($1)`);
    modified = true;
  }

  // Corrigir as any críticos
  const anyPattern = /(\w+)\s+as any/g;
  if (anyPattern.test(content)) {
    // Para casos críticos, usar unknown ao invés de any
    content = content.replace(anyPattern, '$1 as unknown');
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    fixedCount++;
    console.log(`[FIXED] ${filePath} - violações críticas corrigidas`);
  } else {
    console.log(`[OK] ${filePath} - sem correções necessárias`);
  }
});

console.log(`\nCORREÇÃO FINAL: ${fixedCount} arquivos críticos corrigidos`);
