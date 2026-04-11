const fs = require('fs');
const path = require('path');

function findAnyProblemsInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const problems = [];
    
    lines.forEach((line, index) => {
      // Procura por : any
      if (line.includes(': any')) {
        problems.push({
          line: index + 1,
          type: ': any',
          content: line.trim(),
          fullLine: line
        });
      }
      
      // Procura por as any
      if (line.includes('as any')) {
        problems.push({
          line: index + 1,
          type: 'as any',
          content: line.trim(),
          fullLine: line
        });
      }
    });
    
    return problems;
  } catch (error) {
    return [];
  }
}

function analyzeSecurityFiles() {
  const securityDir = './server/security';
  const files = fs.readdirSync(securityDir).filter(f => f.endsWith('.ts'));
  
  console.log('ANÁLISE DE PROBLEMAS DE TYPE SAFETY EM SECURITY/');
  console.log('=' .repeat(60));
  
  let totalProblems = 0;
  const filesWithProblems = [];
  
  files.forEach(file => {
    const filePath = path.join(securityDir, file);
    const problems = findAnyProblemsInFile(filePath);
    
    if (problems.length > 0) {
      filesWithProblems.push({ file, problems });
      totalProblems += problems.length;
      
      console.log(`\n${file} (${problems.length} problemas):`);
      problems.forEach(problem => {
        console.log(`  Linha ${problem.line}: ${problem.type}`);
        console.log(`    ${problem.content}`);
      });
    }
  });
  
  console.log('\n' + '=' .repeat(60));
  console.log('RESUMO:');
  console.log(`Arquivos analisados: ${files.length}`);
  console.log(`Arquivos com problemas: ${filesWithProblems.length}`);
  console.log(`Total de problemas: ${totalProblems}`);
  
  if (filesWithProblems.length > 0) {
    console.log('\nArquivos que precisam de correção:');
    filesWithProblems.forEach(({ file, problems }) => {
      console.log(`  ${file}: ${problems.length} problemas`);
    });
  }
}

analyzeSecurityFiles();
