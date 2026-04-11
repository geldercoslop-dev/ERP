const fs = require('fs');
const path = require('path');

// Lista de arquivos com REQ_USER_UNSAFE
const unsafeFiles = [
  'server/controllers/order.controller.ts',
  'server/core/tracing.ts',
  'server/infra/error-tracking.ts',
  'server/infra/monitoring-integration.ts',
  'server/leo/planning/leo-scheduler.ts',
  'server/leo/utils/leo-notifier.ts',
  'server/middleware/auth.middleware.ts',
  'server/middleware/error-handler.middleware.ts',
  'server/middleware/tenant.middleware.ts',
  'server/middlewares/require-auth-context.ts',
  'server/routes/concurrency-test.ts',
  'server/security/rate-limiting.ts',
  'server/utils/tenant-guard-hardened.ts',
  'server/_core/error-handler.ts',
  'server/_core/oauth.ts'
];

let fixedCount = 0;

unsafeFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${filePath} - arquivo não encontrado`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Adicionar import ValidationError se necessário
  if (content.includes('req.user') && !content.includes('ValidationError')) {
    const importMatch = content.match(/^import .+ from .+$/m);
    if (importMatch) {
      const importLine = importMatch[0];
      const newImport = 'import { ValidationError } from \'../_core/errors/typed-errors.js\';';
      // Ajustar caminho relativo baseado na profundidade do arquivo
      const depth = (filePath.match(/\//g) || []).length - 1;
      const relativePath = '../'.repeat(Math.max(1, depth - 1)) + '_core/errors/typed-errors.js';
      const adjustedImport = `import { ValidationError } from '${relativePath}';`;
      
      content = content.replace(importLine, importLine + '\n' + adjustedImport);
      modified = true;
    }
  }

  // Encontrar e corrigir acessos inseguros a req.user
  const lines = content.split('\n');
  let newLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Verificar se a linha tem acesso direto a req.user sem validação
    if (line.includes('req.user') && !line.includes('if (!req.user)') && !line.includes('if (req.user)')) {
      // Verificar se já tem validação nas linhas anteriores
      let hasValidation = false;
      for (let j = Math.max(0, i - 5); j < i; j++) {
        if (lines[j].includes('if (!req.user)') || lines[j].includes('if (req.user)')) {
          hasValidation = true;
          break;
        }
      }

      if (!hasValidation) {
        // Adicionar validação antes do acesso
        const indent = line.match(/^(\s*)/)[1];
        const validationLine = `${indent}if (!req.user) {\n${indent}  throw new ValidationError("Usuário não autenticado");\n${indent}}\n`;
        
        // Se a linha já tem const/let, precisamos reestruturar
        if (line.includes('const') || line.includes('let')) {
          // Extrair a declaração
          const match = line.match(/(const|let)\s+(\{[^}]+\}|\w+)\s*=\s*req\.user/);
          if (match) {
            const varType = match[1];
            const varName = match[2];
            const newLine = `${indent}if (!req.user) {\n${indent}  throw new ValidationError("Usuário não autenticado");\n${indent}}\n${indent}${varType} ${varName} = req.user;`;
            newLines.push(validationLine);
            newLines.push(newLine);
            modified = true;
            continue;
          }
        }
        
        // Para outros casos, apenas adicionar validação
        newLines.push(validationLine);
        newLines.push(line);
        modified = true;
      } else {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    fixedCount++;
    console.log(`[FIXED] ${filePath} - req.user validado`);
  } else {
    console.log(`[OK] ${filePath} - sem correções necessárias`);
  }
});

console.log(`\nFASE 2 CONCLUÍDA: ${fixedCount} arquivos corrigidos`);
