const fs = require('fs');
const path = require('path');

function findFiles(dir, pattern, ignore = []) {
  const files = [];
  
  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Verificar se está na lista de ignorados
        const shouldIgnore = ignore.some(ignorePattern => {
          const ignorePath = path.relative(dir, fullPath);
          return ignorePath.includes(ignorePattern);
        });
        
        if (!shouldIgnore) {
          walk(fullPath);
        }
      } else if (item.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

const files = findFiles('server', '**/*.ts', ['test', 'tests']);

let errors = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');

  // Bloquear any
  if (content.includes('as any')) {
    errors.push(`[ANY] ${file}`);
  }

  // Bloquear throw new Error genérico
  if (content.includes('throw new Error')) {
    errors.push(`[THROW_GENERIC] ${file}`);
  }

  // Bloquear double cast
  if (content.includes('as unknown as')) {
    errors.push(`[DOUBLE_CAST] ${file}`);
  }

  // Bloquear bypass de validação
  if (content.includes('//@ts-ignore') || content.includes('// @ts-ignore')) {
    errors.push(`[TS_IGNORE] ${file}`);
  }

  // Bloquear acessos diretos sem validação
  if (content.includes('req.user') && !content.includes('if (!req.user)')) {
    errors.push(`[REQ_USER_UNSAFE] ${file}`);
  }
});

if (errors.length > 0) {
  console.error('\n\u26a0\ufe0f VIOLAÇÕES DE ARQUITETURA:\n');
  errors.forEach(e => console.error(e));
  process.exit(1);
}

console.log('\u2705 Arquitetura validada');
