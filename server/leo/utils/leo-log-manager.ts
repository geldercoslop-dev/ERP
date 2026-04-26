/**
 * Gerenciador de Logs do LEO
 * 
 * Sistema avançado de rotação e gerenciamento de logs
 * Mantém apenas os últimos 30 logs automaticamente
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';

export interface LogConfig {
  maxFileSize: number; // MB
  maxFiles: number; // número máximo de arquivos
  logDirectory: string;
  enableCompression: boolean;
  enableDailyRotation: boolean;
}

export interface LogEntry {
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  module: string;
  message: string;
  data?: unknown;
  error?: Error;
  traceId?: string;
}

/**
 * Gerenciador de logs do Leo
 */
class LeoLogManager {
  private static instance: LeoLogManager;
  private config: LogConfig;
  private currentLogFile?: string;
  private currentFileSize: number = 0;
  private isRotating: boolean = false; // FASE 4: Concurrency protection

  private constructor() {
    this.config = {
      maxFileSize: 10, // 10MB
      maxFiles: 30, // manter 30 arquivos
      logDirectory: join(process.cwd(), 'logs'),
      enableCompression: false, // implementar depois se necessário
      enableDailyRotation: true,
    };

    this.initialize();
  }

  public static getInstance(): LeoLogManager {
    if (!LeoLogManager.instance) {
      LeoLogManager.instance = new LeoLogManager();
    }
    return LeoLogManager.instance;
  }

  /**
   * Inicializa o gerenciador de logs
   */
  private initialize(): void {
    try {
      // Criar diretório de logs se não existir
      if (!existsSync(this.config.logDirectory)) {
        mkdirSync(this.config.logDirectory, { recursive: true });
      }

      // Configurar arquivo de log atual
      this.setupCurrentLogFile();

      // Limpar logs antigos
      this.cleanupOldLogs();

      console.log('📝 LeoLogManager inicializado');
    } catch (error) {
      console.error('[LeoLogManager] Erro ao inicializar:', error);
    }
  }

  /**
   * Configura arquivo de log atual
   */
  private setupCurrentLogFile(): void {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    this.currentLogFile = join(this.config.logDirectory, `leo-${dateStr}.log`);

    // FASE 1: Garantir diretório existe
    if (!existsSync(this.config.logDirectory)) {
      try {
        mkdirSync(this.config.logDirectory, { recursive: true });
      } catch (error) {
        console.error('[LeoLogManager] Erro ao criar diretório de logs:', error);
        // Continuar mesmo se falhar - fail-safe
      }
    }

    // FASE 2: Garantir arquivo existe
    if (!existsSync(this.currentLogFile)) {
      try {
        writeFileSync(this.currentLogFile, '', { encoding: 'utf8' });
      } catch (error) {
        console.error('[LeoLogManager] Erro ao criar arquivo de log:', error);
        // Continuar mesmo se falhar - fail-safe
      }
    }

    // Verificar tamanho do arquivo atual
    if (existsSync(this.currentLogFile)) {
      try {
        const stats = statSync(this.currentLogFile);
        this.currentFileSize = stats.size;
      } catch (error) {
        console.error('[LeoLogManager] Erro ao obter tamanho do arquivo:', error);
        this.currentFileSize = 0;
      }
    } else {
      this.currentFileSize = 0;
    }
  }

  /**
   * Escreve entrada no log
   */
  writeLog(entry: LogEntry): void {
    // FASE 4: Evitar rotação simultânea
    if (this.isRotating) {
      // Se está rotacionando, apenas atualiza tamanho e continua
      // Não bloqueia escrita durante rotação
    }

    try {
      // Verificar se precisa rotacionar
      if (this.currentFileSize > this.config.maxFileSize * 1024 * 1024) {
        this.rotateLogFile();
      }

      // Verificar se precisa rotação diária
      if (this.config.enableDailyRotation) {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const fileName = this.currentLogFile?.split('/').pop()?.replace('.log', '') || '';
        const fileDate = fileName.replace('leo-', '');

        if (fileDate !== todayStr) {
          this.rotateLogFile(true); // rotação diária
        }
      }

      if (!this.currentLogFile) {
        this.setupCurrentLogFile();
      }

      const logLine = this.formatLogEntry(entry);
      // FASE 5: Normalizar encoding UTF-8
      appendFileSync(this.currentLogFile!, logLine + '\n', { encoding: 'utf8' });
      
      // Atualizar tamanho
      this.currentFileSize += Buffer.byteLength(logLine + '\n', 'utf8');
    } catch (error) {
      console.error('[LeoLogManager] Erro ao escrever log:', error);
      // FASE 3: Nunca travar execução por falha de log
    }
  }

  /**
   * Formata entrada de log
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    const errorStr = entry.error ? ` ${entry.error.stack || entry.error.message}` : '';
    const traceIdStr = entry.traceId ? ` [${entry.traceId}]` : '';
    
    return `${timestamp} [${entry.level}] [${entry.module}]${traceIdStr} ${entry.message}${dataStr}${errorStr}`;
  }

  /**
   * Rotaciona arquivo de log
   */
  private rotateLogFile(forceDaily: boolean = false): void {
    // FASE 4: Proteção contra concorrência
    if (this.isRotating) {
      console.warn('[LeoLogManager] Rotação já em andamento, ignorando solicitação');
      return;
    }

    this.isRotating = true;

    try {
      if (!this.currentLogFile) {
        this.setupCurrentLogFile();
        return;
      }
      
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');
      
      let newFileName: string;
      if (forceDaily) {
        const dateStr = now.toISOString().split('T')[0];
        newFileName = `leo-${dateStr}.log`;
      } else {
        newFileName = `leo-${timestamp}.log`;
      }
      
      const newFile = join(this.config.logDirectory, newFileName);
      
      // FASE 2: Garantir diretório existe antes de rotacionar
      if (!existsSync(this.config.logDirectory)) {
        try {
          mkdirSync(this.config.logDirectory, { recursive: true });
        } catch (error) {
          console.error('[LeoLogManager] Erro ao criar diretório durante rotação:', error);
          // FASE 3: Fallback - continuar usando arquivo atual
          this.isRotating = false;
          return;
        }
      }

      // Se o arquivo atual existir e tiver conteúdo, mover
      if (existsSync(this.currentLogFile) && this.currentFileSize > 0) {
        try {
          renameSync(this.currentLogFile, newFile);
          console.log(`📋 Log rotacionado: ${this.currentLogFile} -> ${newFile}`);
        } catch (error) {
          console.error('[LeoLogManager] Erro ao mover arquivo durante rotação:', error);
          // FASE 3: Fallback - continuar usando arquivo atual
          this.isRotating = false;
          return;
        }
      }
      
      // Configurar novo arquivo
      this.setupCurrentLogFile();
      this.currentFileSize = 0;

      // Registrar rotação (não chama writeLog para evitar recursão)
      try {
        const rotationLog = this.formatLogEntry({
          timestamp: new Date(),
          level: 'INFO',
          module: 'LeoLogManager',
          message: `Log rotacionado${forceDaily ? ' (diário)' : ''}: ${newFileName}`,
          traceId: 'log-rotation',
        });
        appendFileSync(this.currentLogFile!, rotationLog + '\n', { encoding: 'utf8' });
      } catch (error) {
        console.error('[LeoLogManager] Erro ao registrar rotação:', error);
        // Não falhar se não conseguir registrar
      }

    } catch (error) {
      console.error('[LeoLogManager] Erro ao rotacionar log:', error);
      // FASE 3: Nunca throw error, apenas logar warning
    } finally {
      // FASE 4: Liberar flag de rotação
      this.isRotating = false;
    }
  }

  /**
   * Limpa logs antigos mantendo apenas os mais recentes
   */
  cleanupOldLogs(): void {
    try {
      const files = readdirSync(this.config.logDirectory);
      const logFiles = files
        .filter((file: string) => file.startsWith('leo-') && file.endsWith('.log'))
        .map((file: string) => ({
          name: file,
          path: join(this.config.logDirectory, file),
          mtime: statSync(join(this.config.logDirectory, file)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // mais recentes primeiro

      if (logFiles.length <= this.config.maxFiles) {
        return; // não precisa limpar
      }

      // Remover arquivos antigos
      const filesToDelete = logFiles.slice(this.config.maxFiles);
      let deletedCount = 0;

      for (const file of filesToDelete) {
        try {
          unlinkSync(file.path);
          deletedCount++;
          console.log(`🗑️ Log antigo removido: ${file.name}`);
        } catch (error: unknown) {
          console.error(`[LeoLogManager] Erro ao remover log ${file.name}:`, error);
        }
      }

      if (deletedCount > 0) {
        this.writeLog({
          timestamp: new Date(),
          level: 'INFO',
          module: 'LeoLogManager',
          message: `Limpeza de logs concluída: ${deletedCount} arquivos removidos`,
          data: { deletedCount, totalFiles: logFiles.length - deletedCount },
          traceId: 'log-cleanup',
        });

        // Registrar no banco - desabilitado temporariamente
        // TODO: Implementar quando a função estiver disponível
        /*
        insertLeoActionLog({
          usuario: 'leo-log-manager',
          acao: 'limpar_logs_antigos',
          entidade: 'leo_log_manager',
          dados: JSON.stringify({
            deletedCount,
            totalFiles: logFiles.length - deletedCount,
            maxFiles: this.config.maxFiles,
          }),
          resultado: 'SUCESSO',
        }).catch(error => {
          console.error('[LeoLogManager] Erro ao registrar limpeza no banco:', error);
        });
        */
      }

    } catch (error: unknown) {
      console.error('[LeoLogManager] Erro na limpeza de logs:', error);
    }
  }

  /**
   * Obtém informações sobre os logs
   */
  getLogInfo(): {
    totalFiles: number;
    totalSize: number;
    currentFile: string;
    currentSize: number;
    oldestFile?: string;
    newestFile?: string;
  } {
    try {
      const files = readdirSync(this.config.logDirectory);
      const logFiles = files.filter((file: string) => file.startsWith('leo-') && file.endsWith('.log'));
      
      let totalSize = 0;
      let oldestFile: string | undefined;
      let newestFile: string | undefined;
      let oldestTime = Date.now();
      let newestTime = 0;

      for (const file of logFiles) {
        const filePath = join(this.config.logDirectory, file);
        const stats = statSync(filePath);
        totalSize += stats.size;

        if (stats.mtime.getTime() < oldestTime) {
          oldestTime = stats.mtime.getTime();
          oldestFile = file;
        }

        if (stats.mtime.getTime() > newestTime) {
          newestTime = stats.mtime.getTime();
          newestFile = file;
        }
      }

      return {
        totalFiles: logFiles.length,
        totalSize,
        currentFile: this.currentLogFile?.split('/').pop() || 'unknown',
        currentSize: this.currentFileSize,
        oldestFile,
        newestFile,
      };
    } catch (error) {
      console.error('[LeoLogManager] Erro ao obter informações:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        currentFile: 'error',
        currentSize: 0,
      };
    }
  }

  /**
   * Força rotação manual do log
   */
  forceRotation(): void {
    this.rotateLogFile();
  }

  /**
   * Atualiza configuração
   */
  updateConfig(newConfig: Partial<LogConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[LeoLogManager] Configuração atualizada:', this.config);
  }

  async limparLogsAntigos(): Promise<{ success: boolean; message: string; cleaned?: number }> {
    try {
      const before = this.getLogInfo().totalFiles;
      this.cleanupOldLogs();
      const after = this.getLogInfo().totalFiles;
      const cleaned = Math.max(0, before - after);
      return { success: true, message: "Logs antigos limpos", cleaned };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao limpar logs",
      };
    }
  }
}

// Exportar instância singleton
export const leoLogManager = LeoLogManager.getInstance();
