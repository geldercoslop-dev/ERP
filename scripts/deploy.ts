#!/usr/bin/env node

/**
 * Deploy Script for GRS ERP
 * 
 * Script para preparação e deploy do sistema em produção
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface DeployConfig {
  environment: 'staging' | 'production';
  buildPath: string;
  backupPath: string;
  healthCheckUrl: string;
  maxRetries: number;
}

class DeployManager {
  private config: DeployConfig;
  
  constructor() {
    this.config = {
      environment: (process.env.DEPLOY_ENV as any) || 'staging',
      buildPath: './dist',
      backupPath: './backups',
      healthCheckUrl: process.env.HEALTH_CHECK_URL || 'http://localhost:3000/system/health',
      maxRetries: 5
    };
  }

  /**
   * Executa o deploy completo
   */
  async deploy(): Promise<void> {
    console.log('🚀 Iniciando deploy do GRS ERP');
    console.log(`📍 Ambiente: ${this.config.environment}`);
    console.log(`⏰ Início: ${new Date().toISOString()}`);
    
    try {
      // 1. Validações pré-deploy
      await this.preDeployChecks();
      
      // 2. Backup do sistema atual
      await this.backupCurrentSystem();
      
      // 3. Build do projeto
      await this.buildProject();
      
      // 4. Otimizações de banco
      await this.optimizeDatabase();
      
      // 5. Deploy dos arquivos
      await this.deployFiles();
      
      // 6. Health check
      await this.performHealthCheck();
      
      // 7. Pós-deploy
      await this.postDeployActions();
      
      console.log('✅ Deploy concluído com sucesso!');
      console.log(`⏰ Término: ${new Date().toISOString()}`);
      
    } catch (error: unknown) {
      console.error('❌ Falha no deploy:', error instanceof Error ? error.message : String(error));
      
      // Tentar restaurar backup em caso de falha
      await this.rollback();
      
      process.exit(1);
    }
  }

  /**
   * Validações pré-deploy
   */
  private async preDeployChecks(): Promise<void> {
    console.log('🔍 Executando validações pré-deploy...');
    
    // Verificar variáveis de ambiente
    const requiredEnvVars = [
      'NODE_ENV',
      'DATABASE_URL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Variáveis de ambiente obrigatórias não encontradas: ${missingVars.join(', ')}`);
    }
    
    // Verificar se está em produção
    if (this.config.environment === 'production') {
      const unsafeVars = [
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'SESSION_SECRET'
      ];
      
      const unsafeVarsFound = unsafeVars.filter(varName => {
        const value = process.env[varName];
        return value && (
          value.includes('default') ||
          value.includes('secret') ||
          value.includes('change') ||
          value.length < 20
        );
      });
      
      if (unsafeVarsFound.length > 0) {
        throw new Error(`Variáveis de ambiente inseguras detectadas: ${unsafeVarsFound.join(', ')}`);
      }
    }
    
    // Verificar dependências
    console.log('📦 Verificando dependências...');
    execSync('npm ci --production', { stdio: 'inherit' });
    
    // Type checking
    console.log('🔧 Verificando tipos TypeScript...');
    execSync('npm run type-check', { stdio: 'inherit' });
    
    // Linting
    console.log('🧹 Verificando código com ESLint...');
    execSync('npm run lint', { stdio: 'inherit' });
    
    // Testes
    console.log('🧪 Executando testes...');
    execSync('npm run test', { stdio: 'inherit' });
    
    console.log('✅ Validações pré-deploy concluídas');
  }

  /**
   * Backup do sistema atual
   */
  private async backupCurrentSystem(): Promise<void> {
    console.log('💾 Criando backup do sistema atual...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = join(this.config.backupPath, `backup-${timestamp}`);
    
    // Criar diretório de backup
    execSync(`mkdir -p ${backupDir}`, { stdio: 'inherit' });
    
    // Backup do banco de dados
    if (process.env.DATABASE_URL) {
      console.log('🗄️ Fazendo backup do banco de dados...');
      const backupFile = join(backupDir, 'database.sql');
      
      try {
        execSync(
          `mysqldump --single-transaction --routines --triggers "${process.env.DB_NAME}" > "${backupFile}"`,
          { stdio: 'inherit' }
        );
        console.log('✅ Backup do banco criado');
      } catch (error) {
        console.warn('⚠️ Falha no backup do banco:', error);
      }
    }
    
    // Backup dos arquivos de configuração
    const configFiles = [
      '.env',
      'server/config/env.ts'
    ];
    
    configFiles.forEach(file => {
      if (existsSync(file)) {
        execSync(`cp "${file}" "${backupDir}/"`, { stdio: 'inherit' });
      }
    });
    
    // Salvar metadata do deploy
    const deployInfo = {
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      version: this.getCurrentVersion(),
      gitCommit: this.getGitCommit(),
      nodeVersion: process.version,
      platform: process.platform
    };
    
    writeFileSync(
      join(backupDir, 'deploy-info.json'),
      JSON.stringify(deployInfo, null, 2)
    );
    
    console.log(`✅ Backup criado em: ${backupDir}`);
  }

  /**
   * Build do projeto
   */
  private async buildProject(): Promise<void> {
    console.log('🔨 Build do projeto...');
    
    // Limpar build anterior
    if (existsSync(this.config.buildPath)) {
      execSync(`rm -rf ${this.config.buildPath}`, { stdio: 'inherit' });
    }
    
    // Build de produção
    process.env.NODE_ENV = this.config.environment;
    execSync('npm run build', { stdio: 'inherit' });
    
    console.log('✅ Build concluído');
  }

  /**
   * Otimizações do banco de dados
   */
  private async optimizeDatabase(): Promise<void> {
    console.log('⚡ Otimizando banco de dados...');
    
    try {
      // Criar índices recomendados
      execSync('npm run optimize:db', { stdio: 'inherit' });
      
      // Analisar tabelas
      execSync('npm run db:analyze', { stdio: 'inherit' });
      
      console.log('✅ Banco de dados otimizado');
    } catch (error) {
      console.warn('⚠️ Falha na otimização do banco:', error);
    }
  }

  /**
   * Deploy dos arquivos
   */
  private async deployFiles(): Promise<void> {
    console.log('📁 Deploy dos arquivos...');
    
    // Copiar arquivos buildados
    execSync(`cp -r ${this.config.buildPath}/* ./`, { stdio: 'inherit' });
    
    // Ajustar permissões
    execSync('chmod +x server/index.js', { stdio: 'inherit' });
    
    // Instalar dependências de produção
    execSync('npm ci --production', { stdio: 'inherit' });
    
    console.log('✅ Arquivos deployados');
  }

  /**
   * Health check pós-deploy
   */
  private async performHealthCheck(): Promise<void> {
    console.log('🏥 Executando health check...');
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`Tentativa ${attempt}/${this.config.maxRetries}`);
        
        const response = await fetch(this.config.healthCheckUrl);
        
        if (response.ok) {
          const health = await response.json();
          
          if (health.status === 'ok') {
            console.log('✅ Health check passed');
            return;
          }
        }
        
        throw new Error(`Health check failed: ${response.status}`);
        
      } catch (error) {
        console.error(`Tentativa ${attempt} falhou:`, error instanceof Error ? error.message : String(error));
        
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(5000 * attempt, 30000); // Max 30 segundos
          console.log(`Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error('Health check falhou após todas as tentativas');
  }

  /**
   * Ações pós-deploy
   */
  private async postDeployActions(): Promise<void> {
    console.log('🎯 Executando ações pós-deploy...');
    
    // Limpar cache
    try {
      execSync('npm run cache:clear', { stdio: 'inherit' });
    } catch (error) {
      console.warn('⚠️ Falha ao limpar cache:', error);
    }
    
    // Reiniciar serviços se necessário
    if (this.config.environment === 'production') {
      try {
        execSync('pm2 reload erp-server', { stdio: 'inherit' });
        console.log('✅ Serviços reiniciados');
      } catch (error) {
        console.warn('⚠️ Falha ao reiniciar serviços:', error);
      }
    }
    
    // Notificar deploy
    await this.notifyDeploySuccess();
    
    console.log('✅ Ações pós-deploy concluídas');
  }

  /**
   * Rollback em caso de falha
   */
  private async rollback(): Promise<void> {
    console.log('🔄 Executando rollback...');
    
    try {
      // Encontrar backup mais recente
      const backups = execSync(`ls -1t ${this.config.backupPath}`, { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
      
      if (backups.length === 0) {
        console.warn('⚠️ Nenhum backup encontrado para rollback');
        return;
      }
      
      const latestBackup = join(this.config.backupPath, backups[0]);
      
      // Restaurar arquivos
      execSync(`cp -r ${latestBackup}/* ./`, { stdio: 'inherit' });
      
      // Restaurar banco se disponível
      const dbBackup = join(latestBackup, 'database.sql');
      if (existsSync(dbBackup)) {
        execSync(`mysql "${process.env.DB_NAME}" < "${dbBackup}"`, { stdio: 'inherit' });
      }
      
      console.log('✅ Rollback concluído');
      
    } catch (error) {
      console.error('❌ Falha no rollback:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Notificar sucesso do deploy
   */
  private async notifyDeploySuccess(): Promise<void> {
    console.log('📢 Notificando deploy...');
    
    const deployInfo = {
      environment: this.config.environment,
      version: this.getCurrentVersion(),
      timestamp: new Date().toISOString(),
      gitCommit: this.getGitCommit(),
      success: true
    };
    
    // Aqui poderia integrar com Slack, email, etc.
    console.log('📧 Deploy notificado:', JSON.stringify(deployInfo, null, 2));
  }

  /**
   * Obter versão atual do sistema
   */
  private getCurrentVersion(): string {
    try {
      const packageJson = readFileSync('./package.json', 'utf8');
      return JSON.parse(packageJson).version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Obter commit atual do Git
   */
  private getGitCommit(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
}

// Executar deploy
if (require.main === module) {
  const deployManager = new DeployManager();
  deployManager.deploy().catch(error => {
    console.error('❌ Erro fatal no deploy:', error);
    process.exit(1);
  });
}

export { DeployManager };
