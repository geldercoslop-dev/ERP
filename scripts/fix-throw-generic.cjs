const fs = require('fs');
const path = require('path');

// Lista de arquivos críticos para corrigir THROW_GENERIC
const criticalFiles = [
  'server/controllers/order.controller.ts',
  'server/core/cache.service.ts',
  'server/core/permission.service.ts',
  'server/core/queue.service.ts',
  'server/core/tenant-db-map.ts',
  'server/db/core.ts',
  'server/db/index.ts',
  'server/infra/backup/backup.ts',
  'server/infra/backup/backupDb.ts',
  'server/infra/circuit-breaker.ts',
  'server/infra/redis.ts',
  'server/infra/storage/storage.ts',
  'server/infra/tracing.ts',
  'server/middleware/auth.middleware.ts',
  'server/pdf.ts',
  'server/queue/index.ts',
  'server/queue/queue.ts',
  'server/queue/worker-simple.ts',
  'server/queue/worker.ts',
  'server/security/jwt-auth.ts',
  'server/storage.ts',
  'server/utils/financialUtils.ts',
  'server/utils/tenant-guard-hardened.ts',
  'server/utils/tenant-guard.ts',
  'server/worker.ts',
  'server/_core/sdk.ts'
];

let fixedCount = 0;

criticalFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${filePath} - arquivo não encontrado`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Adicionar import ValidationError se não existir
  if (content.includes('throw new Error') && !content.includes('ValidationError') && !content.includes('InfrastructureError')) {
    // Determinar se é erro de infraestrutura ou validação
    const isInfra = filePath.includes('db') || filePath.includes('infra') || filePath.includes('queue') || filePath.includes('storage') || filePath.includes('redis');
    const importType = isInfra ? 'InfrastructureError' : 'ValidationError';
    
    // Encontrar primeiro import válido para adicionar após ele
    const importMatch = content.match(/^import .+ from .+$/m);
    if (importMatch) {
      const importLine = importMatch[0];
      const newImport = `import { ${importType} } from '../_core/errors/typed-errors.js';`;
      content = content.replace(importLine, importLine + '\n' + newImport);
      modified = true;
    }
  }

  // Substituir throw new Error por erro apropriado
  const isInfra = filePath.includes('db') || filePath.includes('infra') || filePath.includes('queue') || filePath.includes('storage') || filePath.includes('redis');
  const errorType = isInfra ? 'InfrastructureError' : 'ValidationError';

  // Substituir todas as ocorrências
  const oldPattern = /throw new Error\(([^)]+)\)/g;
  const newPattern = `throw new ${errorType}($1)`;
  
  if (oldPattern.test(content)) {
    content = content.replace(oldPattern, newPattern);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    fixedCount++;
    console.log(`[FIXED] ${filePath} - ${errorType}`);
  } else {
    console.log(`[OK] ${filePath} - sem correções necessárias`);
  }
});

console.log(`\nFASE 1 CONCLUÍDA: ${fixedCount} arquivos corrigidos`);
