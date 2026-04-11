const fs = require('fs');
const path = require('path');

function findAndFixTypeSafetyIssues(dir, pattern) {
  const files = [];
  
  function walk(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          walk(fullPath);
        } else if (stat.isFile() && item.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore directories that can't be read
    }
  }
  
  walk(dir);
  
  const results = [];
  
  files.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const issues = [];
      
      lines.forEach((line, index) => {
        if (line.includes('as any')) {
          issues.push({
            line: index + 1,
            type: 'as any',
            content: line.trim()
          });
        }
        
        if (line.includes(': any')) {
          issues.push({
            line: index + 1,
            type: ': any',
            content: line.trim()
          });
        }
      });
      
      if (issues.length > 0) {
        results.push({ file, issues });
      }
    } catch (error) {
      // Ignore files that can't be read
    }
  });
  
  return results;
}

function fixFile(filePath, issues) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    issues.forEach(issue => {
      if (issue.type === 'as any') {
        // Replace as any with proper type guards or unknown
        content = content.replace(/as any/g, 'as unknown');
        modified = true;
      }
      
      if (issue.type === ': any') {
        // Replace : any with : unknown
        content = content.replace(/: any/g, ': unknown');
        modified = true;
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error);
    return false;
  }
}

// Main execution
console.log('ANÁLISE E CORREÇÃO DE TYPE SAFETY - EXPRESS');
console.log('=' .repeat(60));

const directories = [
  './server/routes',
  './server/routers',
  './server/middlewares',
  './server/security'
];

let totalFiles = 0;
let totalIssues = 0;
let fixedFiles = 0;

directories.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`\nAnalisando ${dir}...`);
    const results = findAndFixTypeSafetyIssues(dir);
    
    if (results.length > 0) {
      console.log(`Arquivos com problemas: ${results.length}`);
      
      results.forEach(({ file, issues }) => {
        console.log(`  ${path.basename(file)}: ${issues.length} problemas`);
        issues.forEach(issue => {
          console.log(`    Linha ${issue.line}: ${issue.type} - ${issue.content.substring(0, 80)}...`);
        });
        
        // Fix the file
        if (fixFile(file, issues)) {
          fixedFiles++;
          console.log(`    CORRIGIDO`);
        }
      });
      
      totalFiles += results.length;
      totalIssues += results.reduce((sum, { issues }) => sum + issues.length, 0);
    } else {
      console.log('Nenhum problema encontrado.');
    }
  } else {
    console.log(`Diretório ${dir} não encontrado.`);
  }
});

console.log('\n' + '=' .repeat(60));
console.log('RESUMO:');
console.log(`Arquivos analisados: ${totalFiles}`);
console.log(`Problemas encontrados: ${totalIssues}`);
console.log(`Arquivos corrigidos: ${fixedFiles}`);

console.log('\nPRÓXIMOS PASSOS:');
console.log('1. Executar: npx tsc --noEmit --skipLibCheck');
console.log('2. Verificar se há erros remanescentes');
console.log('3. Corrigir manualmente se necessário');
