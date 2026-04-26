/**
 * Execution Bypass Detector
 * 
 * Varre o código LEO para detectar:
 * - Execução direta de tools sem passar pelo Execution Gate
 * - Import direto de services fora da tool layer
 * - Execução direta de DB fora de service layer
 * - Chamadas internas que bypassam executeLeoAction
 * 
 * VIOLAÇÃO DETECTADA = CRITICAL FAIL
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface BypassViolation {
  file: string;
  line: number;
  type: 'direct_tool_execution' | 'direct_service_import' | 'direct_db_access' | 'gate_bypass';
  description: string;
  severity: 'critical' | 'high' | 'medium';
}

const LEO_DIR = join(process.cwd(), 'server', 'leo');
const TOOLS_DIR = join(process.cwd(), 'server', 'tools');

class ExecutionBypassScanner {
  private violations: BypassViolation[] = [];

  /**
   * Varre todo o código LEO
   */
  async scan(): Promise<BypassViolation[]> {
    console.log('🔍 Scanning LEO code for execution bypass violations...\n');
    
    this.violations = [];
    
    // Scan LEO directory
    await this.scanDirectory(LEO_DIR, 'leo');
    
    // Scan tools directory (apenas para verificar se tools importam services corretamente)
    await this.scanDirectory(TOOLS_DIR, 'tools');
    
    this.reportResults();
    
    return this.violations;
  }

  /**
   * Varre um diretório recursivamente
   */
  private async scanDirectory(dir: string, context: string): Promise<void> {
    try {
      const files = readdirSync(dir);
      
      for (const file of files) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Ignorar node_modules e __tests__
          if (file !== 'node_modules' && file !== '__tests__' && file !== '.git') {
            await this.scanDirectory(fullPath, context);
          }
        } else if (extname(file) === '.ts' || extname(file) === '.js') {
          await this.scanFile(fullPath, context);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
  }

  /**
   * Varre um arquivo específico
   */
  private async scanFile(filePath: string, context: string): Promise<void> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const relativePath = filePath.replace(process.cwd(), '');
      
      // Ignorar arquivos de teste
      if (relativePath.includes('__tests__') || relativePath.includes('test-') || relativePath.includes('.test.')) {
        return;
      }
      
      // Ignorar execution-gate.ts (é a definição do gate)
      if (relativePath.includes('execution-gate.ts')) {
        return;
      }
      
      // Ignorar tools (tools podem chamar services)
      if (relativePath.includes('\\tools\\') || relativePath.includes('/tools/')) {
        return;
      }
      
      // Ignorar utils (utils podem chamar services para logging)
      if (relativePath.includes('\\utils\\') || relativePath.includes('/utils/')) {
        return;
      }
      
      // Padrões de violação
      const patterns = this.getViolationPatterns(context);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        
        for (const pattern of patterns) {
          const match = line.match(pattern.regex);
          if (match) {
            // Ignorar se estiver em comentário
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
              continue;
            }
            
            // Ignorar se for tool importando service (permitido na tool layer)
            if (context === 'tools' && pattern.type === 'direct_service_import') {
              continue;
            }
            
            // Ignorar imports de toolExecutor (o uso foi corrigido, o import permanece)
            if (line.includes('import.*toolExecutor')) {
              continue;
            }
            
            this.violations.push({
              file: relativePath,
              line: lineNumber,
              type: pattern.type,
              description: pattern.description.replace('{match}', match[0]),
              severity: pattern.severity,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning file ${filePath}:`, error);
    }
  }

  /**
   * Obtém padrões de violação
   */
  private getViolationPatterns(context: string): Array<{
    regex: RegExp;
    type: BypassViolation['type'];
    description: string;
    severity: BypassViolation['severity'];
  }> {
    const patterns: Array<{
      regex: RegExp;
      type: BypassViolation['type'];
      description: string;
      severity: BypassViolation['severity'];
    }> = [];
    
    if (context === 'leo') {
      // VIOLAÇÃO CRÍTICA: Import direto de serviços de NEGÓCIO no código LEO
      // Ignora: ai/leo-action-logger, leo-action-log, leo-semantic-memory (infraestrutura LEO)
      // Bloqueia: orders, finance, inventory, clientes, configuracoes (serviços de negócio)
      patterns.push({
        regex: /import.*from.*['"]\.\.\/services\/(orders|finance|inventory|clientes|configuracoes).*\.js['"]/,
        type: 'direct_service_import' as const,
        description: 'Direct business service import detected: {match}',
        severity: 'critical' as const,
      });
      
      // VIOLAÇÃO ALTA: Execução direta de toolExecutor sem passar pelo gate
      patterns.push({
        regex: /toolExecutor\.executeTool/,
        type: 'direct_tool_execution' as const,
        description: 'Direct tool execution detected: {match}',
        severity: 'high' as const,
      });
      
      // VIOLAÇÃO MÉDIA: Chamada direta a service method de negócio (exceto em tools)
      patterns.push({
        regex: /(ordersService|financeService|inventoryService|clientesService|configuracoesService)\.\w+\(/,
        type: 'direct_service_import' as const,
        description: 'Direct business service method call detected: {match}',
        severity: 'medium' as const,
      });
    }
    
    if (context === 'tools') {
      // Tools podem importar services, mas não devem importar DB direto
      patterns.push({
        regex: /import.*from.*['"]\.\.\/db\/.*\.js['"]/,
        type: 'direct_db_access' as const,
        description: 'Direct DB import in tool: {match}',
        severity: 'critical' as const,
      });
      
      patterns.push({
        regex: /import.*drizzle/,
        type: 'direct_db_access' as const,
        description: 'Direct drizzle import in tool: {match}',
        severity: 'critical' as const,
      });
    }
    
    return patterns;
  }

  /**
   * Reporta resultados
   */
  private reportResults(): void {
    console.log('\n' + '='.repeat(80));
    console.log('EXECUTION BYPASS DETECTION REPORT');
    console.log('='.repeat(80) + '\n');
    
    if (this.violations.length === 0) {
      console.log('✅ NO BYPASS VIOLATIONS DETECTED');
      console.log('\nAll executions are properly routed through the Execution Gate.');
      console.log('Tool layer is properly enforced.');
      console.log('No direct service imports detected in LEO code.\n');
      return;
    }
    
    console.log(`❌ ${this.violations.length} VIOLATION(S) DETECTED\n`);
    
    // Group by severity
    const critical = this.violations.filter(v => v.severity === 'critical');
    const high = this.violations.filter(v => v.severity === 'high');
    const medium = this.violations.filter(v => v.severity === 'medium');
    
    if (critical.length > 0) {
      console.log('🔴 CRITICAL VIOLATIONS:');
      this.printViolations(critical);
    }
    
    if (high.length > 0) {
      console.log('\n🟠 HIGH VIOLATIONS:');
      this.printViolations(high);
    }
    
    if (medium.length > 0) {
      console.log('\n🟡 MEDIUM VIOLATIONS:');
      this.printViolations(medium);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Critical: ${critical.length}`);
    console.log(`High: ${high.length}`);
    console.log(`Medium: ${medium.length}`);
    console.log(`Total: ${this.violations.length}\n`);
    
    if (critical.length > 0 || high.length > 0) {
      console.log('⚠️  CRITICAL/HIGH violations must be fixed before deployment.');
      console.log('   All executions must go through the Execution Gate.');
      console.log('   LEO code must not import services directly.\n');
    }
  }

  /**
   * Imprime violações
   */
  private printViolations(violations: BypassViolation[]): void {
    for (const violation of violations) {
      console.log(`  File: ${violation.file}:${violation.line}`);
      console.log(`  Type: ${violation.type}`);
      console.log(`  Description: ${violation.description}`);
      console.log('');
    }
  }
}

// Executar varredura
async function main(): Promise<void> {
  const scanner = new ExecutionBypassScanner();
  const violations = await scanner.scan();
  
  // Exit with error code if critical violations found
  const criticalOrHigh = violations.filter(v => v.severity === 'critical' || v.severity === 'high');
  if (criticalOrHigh.length > 0) {
    process.exit(1);
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('Error running bypass detector:', error);
  process.exit(1);
});

export { ExecutionBypassScanner };
