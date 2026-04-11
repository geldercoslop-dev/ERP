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
    try {
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
    } catch (error) {
      // Ignore directories that can't be read
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
  'setInterval',
  '@ts-ignore',
  '@ts-nocheck',
  '@ts-expect-error'
];

console.log('ANÁLISE PROFUNDA DO SISTEMA - BUSCA DE PROBLEMAS OCULTOS');
console.log('=' .repeat(80));
console.log();

const serverFiles = findFiles('./server', ['.ts', '.js']);
const clientFiles = findFiles('./client', ['.ts', '.js']);

const allFiles = [...serverFiles, ...clientFiles];
const results = {};
const fileIssues = {};

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
    fileIssues[file] = fileResults;
  }
});

// Sort files by number of issues (descending)
const sortedFiles = Object.entries(fileIssues).sort((a, b) => {
  const totalA = Object.values(a[1]).reduce((sum, count) => sum + count, 0);
  const totalB = Object.values(b[1]).reduce((sum, count) => sum + count, 0);
  return totalB - totalA;
});

console.log('ARQUIVOS COM MAIORES PROBLEMAS (ordenados por gravidade):');
console.log('=' .repeat(80));

sortedFiles.slice(0, 20).forEach(([file, issues]) => {
  const totalIssues = Object.values(issues).reduce((sum, count) => sum + count, 0);
  console.log(`\n${file} (${totalIssues} problemas):`);
  
  // Show only issues with count > 0
  Object.entries(issues).forEach(([pattern, count]) => {
    if (count > 0) {
      console.log(`  ${pattern}: ${count}`);
    }
  });
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
console.log(`Arquivos com problemas: ${Object.keys(fileIssues).length}`);

// Calculate total issues
const totalIssues = Object.values(totalResults).reduce((sum, count) => sum + count, 0);
console.log(`Total de problemas encontrados: ${totalIssues}`);

// Categorize problems
console.log('\n' + '=' .repeat(80));
console.log('CATEGORIAS DE PROBLEMAS:');
console.log('=' .repeat(80));

const categories = {
  'Erros de Tipagem (any/as any)': totalResults[': any'] + totalResults['as any'],
  'Throws Genéricos': totalResults['throw new Error'],
  'Fallbacks Silenciosos': totalResults['return null'] + totalResults['return false'] + totalResults['return \\[\\]'] + totalResults['return {}'],
  'Debug/Console Logs': totalResults['console\\.log'] + totalResults['console\\.error'] + totalResults['console\\.warn'],
  'Código Perigoso': totalResults['eval\\('] + totalResults['debugger'],
  'Timers Assíncronos': totalResults['setTimeout'] + totalResults['setInterval'],
  'Supressão TypeScript': totalResults['@ts-ignore'] + totalResults['@ts-nocheck'] + totalResults['@ts-expect-error']
};

Object.entries(categories).forEach(([category, count]) => {
  if (count > 0) {
    console.log(`${category}: ${count} ocorrências`);
  }
});
