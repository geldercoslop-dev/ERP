/**
 * Script para limpeza segura de arquivos temporários
 * Remove apenas arquivos confirmados como temporários
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, rmdirSync } from 'fs';
import { join } from 'path';

interface CleanupPlan {
  filesToRemove: string[];
  filesToKeep: string[];
  directoriesToClean: string[];
}

/**
 * Plano de limpeza baseado na análise
 */
const CLEANUP_PLAN: CleanupPlan = {
  filesToRemove: [
    // Relatórios temporários (já movidos para docs/reports ou desnecessários)
    'AUDITORIA_TECNICA_COMPLETA.md',
    'BACKEND_HARDENING_RELATORIO.md',
    'BUG_LOGIN_CORRIGIDO.md',
    'DATABASE_TRANSACTION_SAFETY_RELATORIO.md',
    'ERP_FINAL_AUDIT_REPORT.md',
    'ERP_SERVICE_LAYER_FINALIZATION.md',
    'ERP_TYPESCRIPT_STABILIZATION_REPORT.md',
    'LEO_AGENT_INTEGRATION_REPORT.md',
    'LEO_AGENT_STABILIZATION_REPORT.md',
    'LEO_AGENT_UPGRADE_REPORT.md',
    'LEO_ANALYTICS_RELATORIO.md',
    'LEO_OPERATIONAL_AGENT_REPORT.md',
    'MULTITENANT_IMPLEMENTATION.md',
    'MULTITENANT_IMPLEMENTATION_REPORT.md',
    'MULTITENANT_ISOLATION_TEST_REPORT.md',
    'PHASE_2_COMPLETION_REPORT.md',
    'RELATORIO_CORRECAO_COMPLETA.md',
    'RELATORIO_FINAL_MULTI_TENANT.md',
    'RELATORIO_FINAL_ROUTERS_MULTI_TENANT.md',
    'RELATORIO_MULTI_TENANT.md',
    'TENANTID_ANALYSIS_COMPLETE.md',
    'TENANTID_IMPLEMENTATION_STRATEGY.md',
    'TENANTID_QUICK_GUIDE.md',
    'TENANTID_REPLACEMENTS_INFO.md',
    'TENANTID_RESUMO_EXECUTIVO_PT.md',
    
    // JSONs temporários de TenantID
    'TENANTID_DELIVERY_INDEX.json',
    'TENANTID_REPLACEMENTS_inventory.json',
    'TENANTID_REPLACEMENTS_logistica.json',
    'TENANTID_REPLACEMENTS_promocoes.json',
    'TENANTID_REPLACEMENTS_users.json',
    
    // Arquivos diversos
    'backup_vendas_app_20260314_081552.sql',
    'build-output.txt',
    'test_output.log',
    'test_results.log'
  ],
  
  filesToKeep: [
    // Arquivos essenciais da raiz
    '.env.example',
    '.gitignore',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'vite.config.ts',
    'vitest.config.ts',
    'drizzle.config.ts',
    'ecosystem.config.cjs',
    'instrument.ts',
    '.auth-config.json',
    '.env',
    '.env.local'
  ],
  
  directoriesToClean: [
    'logs'
  ]
};

/**
 * Verifica se um arquivo existe
 */
function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Remove arquivo com verificação de segurança
 */
function safeRemoveFile(filePath: string): boolean {
  try {
    if (!fileExists(filePath)) {
      console.log(`[SKIP] Arquivo não encontrado: ${filePath}`);
      return true;
    }
    
    // Verificar se está na lista de remoção
    const fileName = filePath.split(/[/\\]/).pop() || '';
    if (!CLEANUP_PLAN.filesToRemove.includes(fileName)) {
      console.log(`[PROTECT] Arquivo protegido: ${filePath}`);
      return false;
    }
    
    // Backup do conteúdo antes de remover (para segurança)
    const content = readFileSync(filePath, 'utf-8');
    const backupPath = filePath + '.backup.' + Date.now();
    writeFileSync(backupPath, content);
    
    // Remover arquivo original
    unlinkSync(filePath);
    
    console.log(`[REMOVED] ${filePath} (backup: ${backupPath})`);
    return true;
  } catch (error) {
    console.error(`[ERROR] Falha ao remover ${filePath}:`, error);
    return false;
  }
}

/**
 * Executa limpeza dos arquivos temporários
 */
function executeCleanup(): void {
  console.log('🧹 Iniciando limpeza de arquivos temporários...\n');
  
  let removedCount = 0;
  let protectedCount = 0;
  let errorCount = 0;
  
  // Processar arquivos para remoção
  CLEANUP_PLAN.filesToRemove.forEach(fileName => {
    const success = safeRemoveFile(fileName);
    if (success) {
      removedCount++;
    } else {
      protectedCount++;
    }
  });
  
  // Verificar arquivos protegidos
  console.log('\n📋 Verificando arquivos protegidos...');
  CLEANUP_PLAN.filesToKeep.forEach(fileName => {
    if (fileExists(fileName)) {
      console.log(`[OK] Arquivo protegido presente: ${fileName}`);
    } else {
      console.log(`[WARN] Arquivo protegido ausente: ${fileName}`);
    }
  });
  
  // Limpar diretórios vazios
  console.log('\n📁 Limpando diretórios...');
  CLEANUP_PLAN.directoriesToClean.forEach(dirName => {
    try {
      if (fileExists(dirName)) {
        const files = readdirSync(dirName);
        if (files.length === 0) {
          rmdirSync(dirName);
          console.log(`[REMOVED] Diretório vazio: ${dirName}`);
        } else {
          console.log(`[SKIP] Diretório não está vazio: ${dirName} (${files.length} arquivos)`);
        }
      } else {
        console.log(`[SKIP] Diretório não encontrado: ${dirName}`);
      }
    } catch (error) {
      console.error(`[ERROR] Falha ao limpar diretório ${dirName}:`, error);
      errorCount++;
    }
  });
  
  // Resumo
  console.log('\n📊 Resumo da limpeza:');
  console.log(`✅ Arquivos removidos: ${removedCount}`);
  console.log(`🛡️ Arquivos protegidos: ${protectedCount}`);
  console.log(`❌ Erros: ${errorCount}`);
  
  if (removedCount > 0) {
    console.log('\n💡 Dica: Os backups foram criados com extensão .backup.[timestamp]');
    console.log('   Você pode restaurá-los se necessário, ou removê-los após confirmar que tudo funciona.');
  }
}

/**
 * Gera relatório da limpeza
 */
function generateCleanupReport(): void {
  const report = {
    timestamp: new Date().toISOString(),
    plan: CLEANUP_PLAN,
    summary: {
      filesToRemoveCount: CLEANUP_PLAN.filesToRemove.length,
      filesToKeepCount: CLEANUP_PLAN.filesToKeep.length,
      directoriesToCleanCount: CLEANUP_PLAN.directoriesToClean.length
    }
  };
  
  const reportPath = 'docs/reports/cleanup-report.json';
  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Relatório gerado: ${reportPath}`);
  } catch (error) {
    console.error('❌ Falha ao gerar relatório:', error);
  }
}

/**
 * Função principal
 */
function main(): void {
  console.log('🚀 ERP Project Cleanup Tool');
  console.log('============================\n');
  
  // Verificar se estamos no diretório correto
  if (!fileExists('package.json')) {
    console.error('❌ Erro: Execute este script na raiz do projeto ERP');
    process.exit(1);
  }
  
  // Gerar relatório antes da limpeza
  generateCleanupReport();
  
  // Executar limpeza
  executeCleanup();
  
  console.log('\n✅ Limpeza concluída!');
  console.log('🔄 Execute os testes para garantir que tudo funciona corretamente.');
}

/**
 * Executa se chamado diretamente
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { executeCleanup, generateCleanupReport, CLEANUP_PLAN };
