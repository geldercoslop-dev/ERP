const fs = require('fs');
const path = require('path');

function countOccurrencesInFile(filePath, patterns) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results = {};
    
    patterns.forEach(pattern => {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = content.match(regex);
      results[pattern] = matches ? matches.length : 0;
    });
    
    return results;
  } catch (error) {
    return {};
  }
}

function findFiles(dir, extensions) {
  const files = [];
  
  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext) && !item.includes('.test.') && !item.includes('.spec.')) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walk(dir);
  return files;
}

const patterns = [
  'throw new Error',
  ': any',
  'as any',
  'return null',
  'return false',
  'return \\[\\]',
  'return {}',
  'console\\.log',
  'console\\.error',
  'console\\.warn',
  'debugger',
  'eval\\(',
  'setTimeout',
  'setInterval'
];

const serverFiles = findFiles('./server', ['.ts', '.js']);
const clientFiles = findFiles('./client', ['.ts', '.js']);

const allFiles = [...serverFiles, ...clientFiles];
const results = {};

console.log('ANÁLISE PROFUNDA DO SISTEMA - BUSCA DE PROBLEMAS OCULTOS');
console.log('=' .repeat(80));
console.log();

let totalResults = {};
patterns.forEach(pattern => {
  totalResults[pattern] = 0;
});

allFiles.forEach(file => {
  const fileResults = countOccurrencesInFile(file, patterns);
  let hasIssues = false;
  
  patterns.forEach(pattern => {
    if (fileResults[pattern] > 0) {
      hasIssues = true;
      totalResults[pattern] += fileResults[pattern];
    }
  });
  
  if (hasIssues) {
    console.log(`\n${file}:`);
    patterns.forEach(pattern => {
      if (fileResults[pattern] > 0) {
        console.log(`  ${pattern}: ${fileResults[pattern]}`);
      }
    });
  }
});

console.log('\n' + '=' .repeat(80));
console.log('RESUMO TOTAL DE PROBLEMAS ENCONTRADOS:');
console.log('=' .repeat(80));

patterns.forEach(pattern => {
  if (totalResults[pattern] > 0) {
    console.log(`${pattern}: ${totalResults[pattern]} ocorrências`);
  }
});

console.log(`\nTotal de arquivos analisados: ${allFiles.length}`);
console.log(`Arquivos com problemas: ${Object.keys(results).length}`);
