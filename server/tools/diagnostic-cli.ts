#!/usr/bin/env node

/**
 * CLI de Diagnóstico do Sistema ERP
 * 
 * Comando: pnpm diagnostic
 * Executa: system-diagnostic.ts e imprime relatório completo
 */

import { runSystemDiagnostic } from './system-diagnostic.js';

// HARDENING: safe improvement - tipo Payload padrão para substituir any
type Payload = Record<string, unknown>;

// Usar DiagnosticResult do system-diagnostic.ts
type DiagnosticReport = import('./system-diagnostic.js').DiagnosticResult;

export class SystemDiagnostic {}

interface DiagnosticOptions {
  verbose?: boolean;
  json?: boolean;
  help?: boolean;
}

class DiagnosticCLI {
  private static instance: DiagnosticCLI;

  private constructor() {}

  public static getInstance(): DiagnosticCLI {
    if (!DiagnosticCLI.instance) {
      DiagnosticCLI.instance = new DiagnosticCLI();
    }
    return DiagnosticCLI.instance;
  }

  /**
   * Executa o diagnóstico principal
   */
  public async run(args: string[]): Promise<void> {
    const options = this.parseArgs(args);

    if (options.help) {
      this.showHelp();
      return;
    }

    console.log('\n🔍 INICIANDO DIAGNÓSTICO COMPLETO DO ERP...\n');

    try {
      const diagnostic = await runSystemDiagnostic();

      if (options.json) {
        console.log(JSON.stringify(diagnostic, null, 2));
      } else {
        this.printDiagnosticReport(diagnostic, options.verbose);
      }

      // Verificar status geral
      const hasIssues = this.hasCriticalIssues(diagnostic);
      
      if (hasIssues) {
        console.log('\n⚠️  SISTEMA COM PROBLEMAS DETECTADOS!');
        console.log('   Execute as ações recomendadas acima.');
        process.exit(1);
      } else {
        console.log('\n✅ SISTEMA FUNCIONANDO NORMALMENTE');
        process.exit(0);
      }

    } catch (error) {
      console.error('\n❌ ERRO DURANTE O DIAGNÓSTICO:');
      console.error((error as Error).message);
      
      if (options.verbose) {
        console.error('\nStack trace:', (error as Error).stack);
      }

      process.exit(2);
    }
  }

  /**
   * Parse dos argumentos da CLI
   */
  private parseArgs(args: string[]): DiagnosticOptions {
    const options: DiagnosticOptions = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '-v':
        case '--verbose':
          options.verbose = true;
          break;
        case '-j':
        case '--json':
          options.json = true;
          break;
        case '-h':
        case '--help':
          options.help = true;
          break;
        default:
          if (arg.startsWith('-')) {
            console.error(`Opção desconhecida: ${arg}`);
            this.showHelp();
            process.exit(1);
          }
      }
    }

    return options;
  }

  /**
   * Imprime relatório formatado do diagnóstico
   */
  private printDiagnosticReport(diagnostic: DiagnosticReport, verbose: boolean = false): void {
    console.log('='.repeat(60));
    console.log('📊 RELATÓRIO DE DIAGNÓSTICO DO SISTEMA ERP');
    console.log('='.repeat(60));
    console.log(`Timestamp: ${diagnostic.timestamp}`);
    console.log('');

    // Saúde do Sistema
    console.log('🖥️  SAÚDE DO SISTEMA:');
    console.log(`   Status: ${this.getStatusEmoji(diagnostic.systemHealth.status)} ${diagnostic.systemHealth.status.toUpperCase()}`);
    console.log(`   Uptime: ${Math.floor(diagnostic.systemHealth.uptime / 60)}min ${Math.floor(diagnostic.systemHealth.uptime % 60)}s`);
    console.log(`   Memória: ${Math.round((diagnostic.systemHealth.memoryUsage.heapUsed / diagnostic.systemHealth.memoryUsage.heapTotal) * 100)}% usado`);
    
    if (verbose) {
      console.log(`   Heap: ${(diagnostic.systemHealth.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(diagnostic.systemHealth.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
    }
    console.log('');

    // Saúde do Banco
    console.log('🗄️  SAÚDE DO BANCO:');
    console.log(`   Status: ${this.getStatusEmoji(diagnostic.databaseHealth.status)} ${diagnostic.databaseHealth.status.toUpperCase()}`);
    
    if (diagnostic.databaseHealth.slowQueries.length > 0) {
      console.log(`   Queries Lentas: ${diagnostic.databaseHealth.slowQueries.length}`);
      
      if (verbose) {
        console.log('   Queries lentas recentes:');
        diagnostic.databaseHealth.slowQueries.slice(0, 3).forEach((query: unknown, index: number) => {
          const q = query as { duration: number; query: string };
          console.log(`     ${index + 1}. ${q.duration}ms - ${q.query.substring(0, 100)}...`);
        });
      }
    }
    console.log('');

    // Saúde das Rotas
    console.log('🛣️  SAÚDE DAS ROTAS:');
    console.log(`   Taxa Erro: ${diagnostic.routeHealth.errorRate.toFixed(2)}%`);
    console.log(`   Tempo Resposta: ${diagnostic.routeHealth.avgResponseTime}ms`);
    
    if (diagnostic.routeHealth.errors.length > 0) {
      console.log(`   Erros Recentes: ${diagnostic.routeHealth.errors.length}`);
      
      if (verbose) {
        console.log('   Erros recentes:');
        diagnostic.routeHealth.errors.slice(0, 3).forEach((error: unknown, index: number) => {
          const e = error as { route: string; error: string };
          console.log(`     ${index + 1}. ${e.route} - ${e.error}`);
        });
      }
    }
    console.log('');

    // Saúde das Filas
    console.log('📋 SAÚDE DAS FILAS:');
    console.log(`   Status: ${this.getStatusEmoji(diagnostic.queueHealth.status)} ${diagnostic.queueHealth.status.toUpperCase()}`);
    console.log(`   Jobs Pendentes: ${diagnostic.queueHealth.pendingJobs}`);
    console.log(`   Jobs Processando: ${diagnostic.queueHealth.processingJobs}`);
    console.log(`   Jobs Falhados: ${diagnostic.queueHealth.failedJobs}`);
    console.log('');

    // Saúde dos Serviços
    console.log('🔧 SAÚDE DOS SERVIÇOS:');
    const serviceEntries = Object.entries(diagnostic.serviceHealth) as [string, { status: string; errorCount: number; lastError?: string }][];
    const healthyServices = serviceEntries.filter(([, health]) => health.status === 'healthy').length;
    const totalServices = serviceEntries.length;
    
    console.log(`   Serviços Saudáveis: ${healthyServices}/${totalServices}`);
    
    if (verbose) {
      serviceEntries.forEach(([serviceName, health]) => {
        console.log(`   ${serviceName}: ${this.getStatusEmoji(health.status)} ${health.status.toUpperCase()}`);
        if (health.errorCount > 0) {
          console.log(`     Erros: ${health.errorCount}`);
          if (health.lastError) {
            console.log(`     Último erro: ${health.lastError.substring(0, 100)}...`);
          }
        }
      });
    }
    this.printRecommendations(diagnostic);
    
    console.log('='.repeat(60));
  }

  /**
   * Imprime recomendações baseadas no diagnóstico
   */
  private printRecommendations(diagnostic: DiagnosticReport): void {
    const recommendations: string[] = [];

    // Sistema
    if (diagnostic.systemHealth.status === 'critical') {
      recommendations.push('🔥 Reiniciar o servidor (uso crítico de memória)');
    } else if (diagnostic.systemHealth.status === 'warning') {
      recommendations.push('⚠️ Monitorar uso de memória (acima de 75%)');
    }

    // Banco
    if (diagnostic.databaseHealth.status === 'disconnected') {
      recommendations.push('� Verificar conexão com banco de dados');
    } else if (diagnostic.databaseHealth.status === 'slow') {
      recommendations.push('🐌 Otimizar queries lentas ou adicionar índices');
    }

    // Rotas
    if (diagnostic.routeHealth.errorRate > 5) {
      recommendations.push('� Investigar alta taxa de erro nas rotas');
    }

    // Filas
    if (diagnostic.queueHealth.status === 'stalled') {
      recommendations.push('⏸️ Verificar processamento de filas');
    }

    // Serviços
    const errorServices = Object.entries(diagnostic.serviceHealth || {}) as [string, { status: string; errorCount: number; lastError?: string }][];
    const filteredErrorServices = errorServices.filter(([, health]) => health.status === 'error');
    
    if (filteredErrorServices.length > 0) {
      recommendations.push(`🔧 Verificar serviços com erros: ${filteredErrorServices.map(([name]) => name).join(', ')}`);
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Sistema operando normalmente - nenhuma ação necessária');
    }

    recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
  }

  /**
   * Verifica se há problemas críticos
   */
  private hasCriticalIssues(diagnostic: DiagnosticReport): boolean {
    return diagnostic.systemHealth.status === 'critical' ||
           diagnostic.databaseHealth.status === 'disconnected' ||
           diagnostic.queueHealth.status === 'stalled';
  }

  /**
   * Retorna emoji baseado no status
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️';
      case 'critical': return '🔥';
      case 'connected': return '🟢';
      case 'disconnected': return '🔴';
      case 'slow': return '🐌';
      case 'active': return '🟢';
      case 'stalled': return '🟡';
      case 'empty': return '⚪';
      default: return '❓';
    }
  }

  /**
   * Exibe ajuda do comando
   */
  private showHelp(): void {
    console.log(`
🔍 CLI DE DIAGNÓSTICO ERP

USO:
  pnpm diagnostic [opções]

OPÇÕES:
  -v, --verbose     Modo verboso com detalhes completos
  -j, --json       Saída em formato JSON
  -h, --help        Exibe esta ajuda

EXEMPLOS:
  pnpm diagnostic                    # Diagnóstico simples
  pnpm diagnostic --verbose            # Diagnóstico detalhado
  pnpm diagnostic --json              # Saída em JSON

INFORMAÇÕES:
  - Verifica saúde completa do sistema ERP
  - Testa conexão e performance do banco
  - Analisa rotas, filas e serviços
  - Registra resultados no audit_log
  - Gera relatório com recomendações

CÓDIGOS DE SAÍDA:
  0 - Sistema saudável
  1 - Problemas detectados
  2 - Erro no diagnóstico
    `);
  }
}

// Execução principal
if (require.main === module) {
  const cli = DiagnosticCLI.getInstance();
  cli.run(process.argv.slice(2)).catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(2);
  });
}

export { DiagnosticCLI };
