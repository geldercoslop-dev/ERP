/**
 * Script para padronizar imports relativos por aliases
 * Substitui imports longos como ../../../utils por @/utils
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, relative } from 'path';

interface ImportReplacement {
  filePath: string;
  original: string;
  replacement: string;
  line: number;
}

interface AliasMapping {
  [key: string]: string;
}

/**
 * Configuração de aliases baseada no tsconfig.json
 */
const ALIAS_MAPPINGS: AliasMapping = {
  '@/': './client/src/',
  '@shared/': './shared/',
  '@server/': './server/',
  '@types/': './types/',
  '@leo/': './server/leo/'
};

/**
 * Classe para padronizar imports
 */
class ImportStandardizer {
  private projectRoot: string;
  private replacements: ImportReplacement[] = [];
  
  constructor(projectRoot: string = '.') {
    this.projectRoot = projectRoot;
  }

  /**
   * Converte path relativo para alias
   */
  private convertToAlias(relativePath: string, sourceFile: string): string | null {
    const sourceDir = dirname(sourceFile);
    const absolutePath = join(sourceDir, relativePath);
    const projectRelativePath = relative(this.projectRoot, absolutePath).replace(/\\/g, '/');
    
    // Procurar por alias correspondente
    for (const [alias, basePath] of Object.entries(ALIAS_MAPPINGS)) {
      if (projectRelativePath.startsWith(basePath.replace(/^\.\//, ''))) {
        const remainingPath = projectRelativePath.replace(basePath.replace(/^\.\//, ''), '');
        return alias + remainingPath;
      }
    }
    
    return null;
  }

  /**
   * Processa um arquivo TypeScript
   */
  private processFile(filePath: string): ImportReplacement[] {
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const replacements: ImportReplacement[] = [];
    
    // Regex para encontrar imports
    const importRegex = /^import\s+(?:.*?\s+from\s+['"]([^'"]+)['"]|{([^}]+)}\s+from\s+['"]([^'"]+)['"]|\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"])/gm;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1] || match[3] || match[5];
      
      if (!importPath) continue;
      
      // Ignorar imports de node_modules e imports que já usam alias
      if (!importPath.startsWith('.') && !importPath.startsWith('@')) {
        continue;
      }
      
      // Ignorar imports que já usam alias
      if (importPath.startsWith('@/')) {
        continue;
      }
      
      // Tentar converter para alias
      const aliasPath = this.convertToAlias(importPath, filePath);
      
      if (aliasPath) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const originalLine = lines[lineNumber - 1];
        
        replacements.push({
          filePath,
          original: originalLine,
          replacement: originalLine.replace(importPath, aliasPath),
          line: lineNumber
        });
      }
    }
    
    return replacements;
  }

  /**
   * Obtém todos os arquivos TypeScript/JavaScript
   */
  private getAllTsFiles(dir: string = this.projectRoot): string[] {
    const files: string[] = [];
    
    if (!existsSync(dir)) {
      return files;
    }

    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        
        try {
          const stat = require('fs').statSync(fullPath);
          
          if (stat.isDirectory()) {
            // Ignorar node_modules, dist, .git
            if (!['node_modules', 'dist', '.git', 'coverage'].includes(item)) {
              files.push(...this.getAllTsFiles(fullPath));
            }
          } else if (item.endsWith('.ts') || item.endsWith('.tsx') || item.endsWith('.js') || item.endsWith('.jsx')) {
            files.push(fullPath);
          }
        } catch (error) {
          // Ignorar erros de permissão
        }
      }
    } catch (error) {
      // Ignorar erros de leitura
    }
    
    return files;
  }

  /**
   * Aplica as substituições nos arquivos
   */
  private applyReplacements(replacements: ImportReplacement[]): void {
    // Agrupar substituições por arquivo
    const fileReplacements = new Map<string, ImportReplacement[]>();
    
    for (const replacement of replacements) {
      if (!fileReplacements.has(replacement.filePath)) {
        fileReplacements.set(replacement.filePath, []);
      }
      fileReplacements.get(replacement.filePath)!.push(replacement);
    }
    
    // Aplicar substituições arquivo por arquivo
    for (const [filePath, fileReps] of fileReplacements) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Aplicar substituições em ordem reversa para não afetar os índices
        fileReps.sort((a, b) => b.line - a.line);
        
        for (const replacement of fileReps) {
          lines[replacement.line - 1] = replacement.replacement;
        }
        
        writeFileSync(filePath, lines.join('\n'), 'utf-8');
        console.log(`✅ Atualizado: ${filePath} (${fileReps.length} substituições)`);
      } catch (error) {
        console.error(`❌ Erro ao atualizar ${filePath}:`, error);
      }
    }
  }

  /**
   * Executa a padronização
   */
  standardize(): void {
    console.log('🔧 Padronizando imports...\n');
    
    const files = this.getAllTsFiles();
    const allReplacements: ImportReplacement[] = [];
    
    console.log(`📁 Analisando ${files.length} arquivos...`);
    
    for (const file of files) {
      const replacements = this.processFile(file);
      allReplacements.push(...replacements);
    }
    
    if (allReplacements.length === 0) {
      console.log('✅ Nenhum import precisa ser padronizado.');
      return;
    }
    
    console.log(`\n🔄 Encontradas ${allReplacements.length} substituições:\n`);
    
    // Mostrar preview das substituições
    const preview = allReplacements.slice(0, 10);
    for (const replacement of preview) {
      const fileName = replacement.filePath.split(/[/\\]/).pop() || '';
      console.log(`📄 ${fileName}:${replacement.line}`);
      console.log(`   ❌ ${replacement.original}`);
      console.log(`   ✅ ${replacement.replacement}\n`);
    }
    
    if (allReplacements.length > preview.length) {
      console.log(`... e mais ${allReplacements.length - preview.length} substituições`);
    }
    
    // Aplicar substituições
    console.log('\n🔄 Aplicando substituições...');
    this.applyReplacements(allReplacements);
    
    console.log(`\n✅ Padronização concluída! ${allReplacements.length} imports atualizados.`);
  }

  /**
   * Gera relatório das substituições
   */
  generateReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      aliasMappings: ALIAS_MAPPINGS,
      totalFiles: this.getAllTsFiles().length,
      totalReplacements: this.replacements.length,
      replacements: this.replacements
    };
    
    try {
      require('fs').writeFileSync(
        'docs/reports/import-standardization-report.json',
        JSON.stringify(report, null, 2)
      );
      console.log('📄 Relatório gerado: docs/reports/import-standardization-report.json');
    } catch (error) {
      console.error('❌ Falha ao gerar relatório:', error);
    }
  }
}

/**
 * Função principal
 */
function main(): void {
  console.log('🚀 ERP Import Standardizer');
  console.log('==========================\n');
  
  const standardizer = new ImportStandardizer(process.cwd());
  
  try {
    standardizer.standardize();
    standardizer.generateReport();
    
    console.log('\n✅ Padronização concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante padronização:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ImportStandardizer, ALIAS_MAPPINGS };
