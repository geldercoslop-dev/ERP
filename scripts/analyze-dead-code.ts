/**
 * Script para identificar código morto e imports não utilizados
 * Analisa o projeto em busca de código que pode ser removido com segurança
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';

interface DeadCodeAnalysis {
  unusedImports: Array<{ file: string; imports: string[] }>;
  unusedFiles: Array<{ file: string; reason: string }>;
  duplicateFunctions: Array<{ name: string; locations: string[] }>;
  unusedExports: Array<{ file: string; exports: string[] }>;
}

interface FileAnalysis {
  imports: Set<string>;
  exports: Set<string>;
  functions: Set<string>;
  classes: Set<string>;
  variables: Set<string>;
}

/**
 * Classe para análise de código morto
 */
class DeadCodeAnalyzer {
  private projectRoot: string;
  private fileCache: Map<string, FileAnalysis> = new Map();
  private fileReferences: Map<string, Set<string>> = new Map();
  
  constructor(projectRoot: string = '.') {
    this.projectRoot = projectRoot;
  }

  /**
   * Analisa um arquivo TypeScript/JavaScript
   */
  private analyzeFile(filePath: string): FileAnalysis {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }

    const content = readFileSync(filePath, 'utf-8');
    const analysis: FileAnalysis = {
      imports: new Set(),
      exports: new Set(),
      functions: new Set(),
      classes: new Set(),
      variables: new Set()
    };

    // Regex patterns para análise
    const patterns = {
      import: /^import\s+(?:.*?\s+from\s+['"]([^'"]+)['"]|{([^}]+)}\s+from\s+['"]([^'"]+)['"]|\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"])/gm,
      export: /^export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/gm,
      function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
      class: /^(?:export\s+)?class\s+(\w+)/gm,
      variable: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/gm
    };

    // Extrair imports
    let match;
    while ((match = patterns.import.exec(content)) !== null) {
      const importPath = match[1] || match[3] || match[5];
      if (importPath) {
        analysis.imports.add(importPath);
      }
    }

    // Resetar lastIndex para os outros patterns
    Object.values(patterns).forEach(pattern => pattern.lastIndex = 0);

    // Extrair exports
    while ((match = patterns.export.exec(content)) !== null) {
      analysis.exports.add(match[1]);
    }

    // Extrair funções
    patterns.function.lastIndex = 0;
    while ((match = patterns.function.exec(content)) !== null) {
      analysis.functions.add(match[1]);
    }

    // Extrair classes
    patterns.class.lastIndex = 0;
    while ((match = patterns.class.exec(content)) !== null) {
      analysis.classes.add(match[1]);
    }

    // Extrair variáveis
    patterns.variable.lastIndex = 0;
    while ((match = patterns.variable.exec(content)) !== null) {
      analysis.variables.add(match[1]);
    }

    this.fileCache.set(filePath, analysis);
    return analysis;
  }

  /**
   * Obtém todos os arquivos TypeScript/JavaScript do projeto
   */
  private getAllTsFiles(dir: string = this.projectRoot): string[] {
    const files: string[] = [];
    
    if (!existsSync(dir)) {
      return files;
    }

    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Ignorar node_modules, dist, .git
        if (!['node_modules', 'dist', '.git', 'coverage'].includes(item)) {
          files.push(...this.getAllTsFiles(fullPath));
        }
      } else if (extname(item) === '.ts' || extname(item) === '.tsx' || extname(item) === '.js' || extname(item) === '.jsx') {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Verifica se um import é utilizado
   */
  private isImportUsed(importPath: string, sourceFile: string): boolean {
    // Imports relativos
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const resolvedPath = join(dirname(sourceFile), importPath);
      const files = this.getAllTsFiles();
      
      // Procurar por arquivos correspondentes
      for (const file of files) {
        if (file.includes(resolvedPath) || file === resolvedPath + '.ts' || file === resolvedPath + '.tsx') {
          return true;
        }
      }
    }
    
    // Imports de pacotes (node_modules)
    if (!importPath.startsWith('.')) {
      return true; // Considerar como utilizado (pode ser difícil de verificar)
    }
    
    return false;
  }

  /**
   * Identifica imports não utilizados
   */
  private findUnusedImports(): Array<{ file: string; imports: string[] }> {
    const unusedImports: Array<{ file: string; imports: string[] }> = [];
    const files = this.getAllTsFiles();
    
    for (const file of files) {
      const analysis = this.analyzeFile(file);
      const unused: string[] = [];
      
      for (const importPath of analysis.imports) {
        if (!this.isImportUsed(importPath, file)) {
          unused.push(importPath);
        }
      }
      
      if (unused.length > 0) {
        unusedImports.push({ file, imports: unused });
      }
    }
    
    return unusedImports;
  }

  /**
   * Identifica arquivos que não são importados por nenhum outro
   */
  private findUnusedFiles(): Array<{ file: string; reason: string }> {
    const files = this.getAllTsFiles();
    const unusedFiles: Array<{ file: string; reason: string }> = [];
    
    // Arquivos que geralmente não são importados mas são necessários
    const essentialFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'vitest.config.ts',
      'drizzle.config.ts',
      'ecosystem.config.cjs'
    ];
    
    for (const file of files) {
      // Verificar se é um arquivo essencial
      const fileName = file.split(/[/\\]/).pop() || '';
      if (essentialFiles.includes(fileName)) {
        continue;
      }
      
      // Verificar se é um ponto de entrada
      if (fileName.includes('main.') || fileName.includes('index.') || fileName.includes('App.')) {
        continue;
      }
      
      // Verificar se é um arquivo de configuração ou script
      if (file.includes('scripts/') || file.includes('config/')) {
        continue;
      }
      
      // Verificar se é importado por algum outro arquivo
      let isUsed = false;
      const relativePath = file.replace(this.projectRoot, '').replace(/\\/g, '/').replace(/^\//, '');
      
      for (const otherFile of files) {
        if (otherFile === file) continue;
        
        try {
          const content = readFileSync(otherFile, 'utf-8');
          
          // Verificar se o arquivo é importado
          if (content.includes(relativePath) || 
              content.includes(relativePath.replace('.ts', '')) ||
              content.includes(relativePath.replace('.tsx', ''))) {
            isUsed = true;
            break;
          }
        } catch (error) {
          // Ignorar erros de leitura
        }
      }
      
      if (!isUsed) {
        unusedFiles.push({ 
          file, 
          reason: 'Não importado por nenhum outro arquivo' 
        });
      }
    }
    
    return unusedFiles;
  }

  /**
   * Executa análise completa de código morto
   */
  analyze(): DeadCodeAnalysis {
    console.log('🔍 Analisando código morto...\n');
    
    const analysis: DeadCodeAnalysis = {
      unusedImports: this.findUnusedImports(),
      unusedFiles: this.findUnusedFiles(),
      duplicateFunctions: [], // TODO: Implementar se necessário
      unusedExports: [] // TODO: Implementar se necessário
    };
    
    return analysis;
  }

  /**
   * Gera relatório da análise
   */
  generateReport(analysis: DeadCodeAnalysis): void {
    console.log('📋 Relatório de Código Morto');
    console.log('========================\n');
    
    // Imports não utilizados
    if (analysis.unusedImports.length > 0) {
      console.log(`📦 Imports não utilizados (${analysis.unusedImports.length} arquivos):`);
      for (const { file, imports } of analysis.unusedImports) {
        console.log(`  📄 ${file}:`);
        imports.forEach(imp => console.log(`    ❌ ${imp}`));
      }
      console.log();
    } else {
      console.log('✅ Nenhum import não utilizado encontrado.\n');
    }
    
    // Arquivos não utilizados
    if (analysis.unusedFiles.length > 0) {
      console.log(`🗑️  Arquivos potencialmente não utilizados (${analysis.unusedFiles.length} arquivos):`);
      for (const { file, reason } of analysis.unusedFiles) {
        console.log(`  📄 ${file}`);
        console.log(`    💡 ${reason}`);
      }
      console.log();
    } else {
      console.log('✅ Nenhum arquivo não utilizado encontrado.\n');
    }
    
    // Resumo
    const totalIssues = analysis.unusedImports.length + analysis.unusedFiles.length;
    console.log('📊 Resumo:');
    console.log(`  📦 Imports não utilizados: ${analysis.unusedImports.length}`);
    console.log(`  🗑️  Arquivos não utilizados: ${analysis.unusedFiles.length}`);
    console.log(`  🚨 Total de problemas: ${totalIssues}`);
    
    if (totalIssues > 0) {
      console.log('\n⚠️  Revise cuidadosamente antes de remover qualquer arquivo ou import.');
    } else {
      console.log('\n✅ O código parece estar limpo!');
    }
  }

  /**
   * Salva relatório em arquivo JSON
   */
  saveReport(analysis: DeadCodeAnalysis, outputPath: string = 'docs/reports/dead-code-analysis.json'): void {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        analysis,
        summary: {
          totalUnusedImports: analysis.unusedImports.length,
          totalUnusedFiles: analysis.unusedFiles.length,
          totalIssues: analysis.unusedImports.length + analysis.unusedFiles.length
        }
      };
      
      writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`📄 Relatório salvo em: ${outputPath}`);
    } catch (error) {
      console.error('❌ Falha ao salvar relatório:', error);
    }
  }
}

/**
 * Função principal
 */
function main(): void {
  console.log('🚀 ERP Dead Code Analyzer');
  console.log('========================\n');
  
  const analyzer = new DeadCodeAnalyzer(process.cwd());
  
  try {
    const analysis = analyzer.analyze();
    analyzer.generateReport(analysis);
    analyzer.saveReport(analysis);
    
    console.log('\n✅ Análise concluída!');
  } catch (error) {
    console.error('❌ Erro durante análise:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DeadCodeAnalyzer, DeadCodeAnalysis };
