const fs = require('fs');
const path = require('path');

function findFilesByPattern(pattern) {
  const [baseDir, ...rest] = pattern.split('/**');
  const files = [];
  
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  if (fs.existsSync(baseDir)) {
    walk(baseDir);
  }
  
  return files;
}

const forbiddenPaths = [
  'server/_core',
  'server/services',
  'server/security'
];

let violations = [];

forbiddenPaths.forEach(dir => {
  const files = findFilesByPattern(dir);

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');

    // Permitir apenas comentários ou strings com "leo"
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      // Ignorar comentários
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
        return;
      }

      // Verificar se "leo" aparece em código real
      if (line.includes('leo') && 
          !line.includes('//') && 
          !line.includes('/*') && 
          !line.includes('*') &&
          !line.includes('console.log') &&
          !line.includes('logger.') &&
          !line.includes('error') &&
          !line.includes('warn') &&
          !line.includes('info')) {
        
        // Permitir imports específicos seguros
        if (line.includes('import') && 
            (line.includes('leoLongMemory') || 
             line.includes('askLeoQuestion') || 
             line.includes('getLeoStatusSummary'))) {
          return;
        }

        // Permitir interfaces de contexto
        if (line.includes('interface') || line.includes('type')) {
          return;
        }

        violations.push(`[LEO_VAZAMENTO] ${file}:${index + 1} - ${line.trim()}`);
      }
    });
  });
});

if (violations.length > 0) {
  console.error('\n\u26a0\ufe0f LEO VAZANDO PARA CORE:\n');
  violations.forEach(v => console.error(v));
  process.exit(1);
}

console.log('\u2705 LEO isolado corretamente');
