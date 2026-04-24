/**
 * Gerenciador de Logs do LEO
 *
 * Sistema avançado de rotação e gerenciamento de logs
 * Mantém apenas os últimos 30 logs automaticamente
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
/**
 * Gerenciador de logs do Leo
 */
class LeoLogManager {
    static instance;
    config;
    currentLogFile;
    currentFileSize = 0;
    constructor() {
        this.config = {
            maxFileSize: 10, // 10MB
            maxFiles: 30, // manter 30 arquivos
            logDirectory: join(process.cwd(), 'logs'),
            enableCompression: false, // implementar depois se necessário
            enableDailyRotation: true,
        };
        this.initialize();
    }
    static getInstance() {
        if (!LeoLogManager.instance) {
            LeoLogManager.instance = new LeoLogManager();
        }
        return LeoLogManager.instance;
    }
    /**
     * Inicializa o gerenciador de logs
     */
    initialize() {
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
        }
        catch (error) {
            console.error('[LeoLogManager] Erro ao inicializar:', error);
        }
    }
    /**
     * Configura arquivo de log atual
     */
    setupCurrentLogFile() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        this.currentLogFile = join(this.config.logDirectory, `leo-${dateStr}.log`);
        // Verificar tamanho do arquivo atual
        if (existsSync(this.currentLogFile)) {
            const stats = statSync(this.currentLogFile);
            this.currentFileSize = stats.size;
        }
        else {
            this.currentFileSize = 0;
        }
    }
    /**
     * Escreve entrada no log
     */
    writeLog(entry) {
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
            appendFileSync(this.currentLogFile, logLine + '\n', 'utf8');
            // Atualizar tamanho
            this.currentFileSize += Buffer.byteLength(logLine + '\n', 'utf8');
        }
        catch (error) {
            console.error('[LeoLogManager] Erro ao escrever log:', error);
        }
    }
    /**
     * Formata entrada de log
     */
    formatLogEntry(entry) {
        const timestamp = entry.timestamp.toISOString();
        const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
        const errorStr = entry.error ? ` ${entry.error.stack || entry.error.message}` : '';
        const traceIdStr = entry.traceId ? ` [${entry.traceId}]` : '';
        return `${timestamp} [${entry.level}] [${entry.module}]${traceIdStr} ${entry.message}${dataStr}${errorStr}`;
    }
    /**
     * Rotaciona arquivo de log
     */
    rotateLogFile(forceDaily = false) {
        try {
            if (!this.currentLogFile)
                return;
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            let newFileName;
            if (forceDaily) {
                const dateStr = now.toISOString().split('T')[0];
                newFileName = `leo-${dateStr}.log`;
            }
            else {
                newFileName = `leo-${timestamp}.log`;
            }
            const newFile = join(this.config.logDirectory, newFileName);
            // Se o arquivo atual existir e tiver conteúdo, mover
            if (existsSync(this.currentLogFile) && this.currentFileSize > 0) {
                renameSync(this.currentLogFile, newFile);
                console.log(`📋 Log rotacionado: ${this.currentLogFile} -> ${newFile}`);
            }
            // Configurar novo arquivo
            this.setupCurrentLogFile();
            this.currentFileSize = 0;
            // Registrar rotação
            this.writeLog({
                timestamp: new Date(),
                level: 'INFO',
                module: 'LeoLogManager',
                message: `Log rotacionado${forceDaily ? ' (diário)' : ''}: ${newFileName}`,
                traceId: 'log-rotation',
            });
        }
        catch (error) {
            console.error('[LeoLogManager] Erro ao rotacionar log:', error);
        }
    }
    /**
     * Limpa logs antigos mantendo apenas os mais recentes
     */
    cleanupOldLogs() {
        try {
            const files = readdirSync(this.config.logDirectory);
            const logFiles = files
                .filter((file) => file.startsWith('leo-') && file.endsWith('.log'))
                .map((file) => ({
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
                }
                catch (error) {
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
        }
        catch (error) {
            console.error('[LeoLogManager] Erro na limpeza de logs:', error);
        }
    }
    /**
     * Obtém informações sobre os logs
     */
    getLogInfo() {
        try {
            const files = readdirSync(this.config.logDirectory);
            const logFiles = files.filter((file) => file.startsWith('leo-') && file.endsWith('.log'));
            let totalSize = 0;
            let oldestFile;
            let newestFile;
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
        }
        catch (error) {
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
    forceRotation() {
        this.rotateLogFile();
    }
    /**
     * Atualiza configuração
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[LeoLogManager] Configuração atualizada:', this.config);
    }
    async limparLogsAntigos() {
        try {
            const before = this.getLogInfo().totalFiles;
            this.cleanupOldLogs();
            const after = this.getLogInfo().totalFiles;
            const cleaned = Math.max(0, before - after);
            return { success: true, message: "Logs antigos limpos", cleaned };
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : "Erro ao limpar logs",
            };
        }
    }
}
// Exportar instância singleton
export const leoLogManager = LeoLogManager.getInstance();
