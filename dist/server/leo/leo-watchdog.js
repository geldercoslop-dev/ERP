/**
 * Watchdog do LEO
 *
 * Monitora se o loop cognitivo parou e reinicia automaticamente
 * Garante continuidade operacional do agente
 */
import { insertLeoActionLog } from '../services/ai/leo-action-logger.js';
import { leoEvents } from './memory/leo-events.js';
import { leoLoop } from './engine/leo-loop.js';
/**
 * Watchdog para garantir continuidade do loop cognitivo do Leo
 */
class LeoWatchdog {
    static instance;
    config = {
        checkInterval: 10000, // 10 segundos
        maxDowntime: 30000, // 30 segundos
        maxRestartAttempts: 3,
        restartCooldown: 60000, // 1 minuto entre tentativas
        enableAutoRestart: true,
    };
    status = {
        isMonitoring: false,
        lastCheck: new Date(),
        lastLoopActivity: new Date(),
        restartAttempts: 0,
        lastRestart: new Date(),
        downtimeCount: 0,
        totalDowntime: 0,
        status: 'healthy',
    };
    monitoringInterval;
    lastLoopStatus;
    constructor() {
        this.initialize();
    }
    static getInstance() {
        if (!LeoWatchdog.instance) {
            LeoWatchdog.instance = new LeoWatchdog();
        }
        return LeoWatchdog.instance;
    }
    /**
     * Inicia monitoramento do watchdog
     */
    async startMonitoring() {
        try {
            if (this.status.isMonitoring) {
                return {
                    success: false,
                    message: 'Watchdog já está monitorando',
                };
            }
            console.log('🐕 Iniciando Watchdog do LEO...');
            this.status.isMonitoring = true;
            this.status.lastCheck = new Date();
            this.status.lastLoopActivity = new Date();
            // Obter status inicial do loop
            const loopStatus = await leoLoop.getLoopStatus();
            this.lastLoopStatus = {
                running: loopStatus.running,
                timestamp: new Date(),
            };
            // Iniciar verificação periódica
            this.monitoringInterval = setInterval(async () => {
                await this.checkLoopHealth();
            }, this.config.checkInterval);
            // Registrar início do watchdog
            await insertLeoActionLog({
                usuario: 'leo-watchdog',
                acao: 'iniciar_watchdog',
                entidade: 'leo_watchdog',
                dados: JSON.stringify({
                    config: this.config,
                    timestamp: new Date(),
                }),
                resultado: 'SUCESSO',
            });
            console.log('🐕 Watchdog do LEO iniciado com sucesso');
            return {
                success: true,
                message: `Watchdog iniciado (verificação a cada ${this.config.checkInterval}ms)`,
            };
        }
        catch (error) {
            console.error('[LeoWatchdog] Erro ao iniciar monitoramento:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao iniciar watchdog',
            };
        }
    }
    /**
     * Para monitoramento do watchdog
     */
    async stopMonitoring() {
        try {
            if (!this.status.isMonitoring) {
                return {
                    success: false,
                    message: 'Watchdog não está monitorando',
                };
            }
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
                this.monitoringInterval = undefined;
            }
            this.status.isMonitoring = false;
            // Registrar parada do watchdog
            await insertLeoActionLog({
                usuario: 'leo-watchdog',
                acao: 'parar_watchdog',
                entidade: 'leo_watchdog',
                dados: JSON.stringify({
                    totalDowntime: this.status.totalDowntime,
                    downtimeCount: this.status.downtimeCount,
                    restartAttempts: this.status.restartAttempts,
                    timestamp: new Date(),
                }),
                resultado: 'SUCESSO',
            });
            console.log('🛑 Watchdog do LEO parado');
            return {
                success: true,
                message: 'Watchdog parado com sucesso',
            };
        }
        catch (error) {
            console.error('[LeoWatchdog] Erro ao parar monitoramento:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao parar watchdog',
            };
        }
    }
    /**
     * Verifica saúde do loop cognitivo
     */
    async checkLoopHealth() {
        try {
            this.status.lastCheck = new Date();
            // Obter status atual do loop
            const currentLoopStatus = await leoLoop.getLoopStatus();
            const currentStatus = {
                running: currentLoopStatus.running,
                timestamp: new Date(),
            };
            // Verificar se o loop parou
            if (this.lastLoopStatus?.running && !currentStatus.running) {
                const downtime = Date.now() - this.lastLoopStatus.timestamp.getTime();
                console.warn(`🚨 Loop cognitivo parado! Downtime: ${downtime}ms`);
                // Registrar parada do loop
                await this.handleLoopStopped(downtime);
            }
            // Verificar se o loop está inativo por muito tempo
            if (!currentStatus.running) {
                const lastActivity = currentStatus.lastDecisionTime ?? currentStatus.timestamp?.getTime() ?? Date.now();
                const inactivityTime = Date.now() - lastActivity;
                if (inactivityTime > this.config.maxDowntime) {
                    console.warn(`⚠️ Loop inativo por muito tempo: ${inactivityTime}ms`);
                    await this.handleLongInactivity(inactivityTime);
                }
            }
            // Atualizar status do loop
            this.lastLoopStatus = currentStatus;
            this.status.lastLoopActivity = currentStatus.running ? new Date() : this.status.lastLoopActivity;
            // Verificar se o watchdog precisa reiniciar
            if (this.status.status === 'critical' && this.config.enableAutoRestart) {
                await this.attemptRestart();
            }
        }
        catch (error) {
            console.error('[LeoWatchdog] Erro na verificação do loop:', error);
            // Registrar erro do watchdog
            await insertLeoActionLog({
                usuario: 'leo-watchdog',
                acao: 'erro_verificacao_loop',
                entidade: 'leo_watchdog',
                dados: JSON.stringify({
                    error: error instanceof Error ? error.message : 'Erro desconhecido',
                    timestamp: new Date(),
                }),
                resultado: 'ERRO',
            });
        }
    }
    /**
     * Lida com parada do loop
     */
    async handleLoopStopped(downtime) {
        try {
            this.status.downtimeCount++;
            this.status.totalDowntime += downtime;
            this.status.status = 'warning';
            // Registrar evento de parada do loop
            await leoEvents.registerEvent({
                tipo: 'erro_sistema',
                descricao: `Loop cognitivo parou inesperadamente (downtime: ${downtime}ms)`,
                prioridade: 'alta',
                dados: {
                    downtime,
                    lastActivity: this.status.lastLoopActivity,
                    downtimeCount: this.status.downtimeCount,
                },
                usuarioCriador: 'leo-watchdog',
            });
            // Se o downtime for muito longo, mudar status para crítico
            if (downtime > this.config.maxDowntime) {
                this.status.status = 'critical';
            }
            console.log(`[LeoWatchdog] Loop parado detectado - Downtime: ${downtime}ms`);
        }
        catch (error) {
            console.error('[LeoWatchdog] Erro ao lidar com parada do loop:', error);
        }
    }
    /**
     * Lida com inatividade prolongada
     */
    async handleLongInactivity(inactivityTime) {
        try {
            this.status.status = 'critical';
            // Registrar evento de inatividade crítica
            await leoEvents.registerEvent({
                tipo: 'erro_sistema',
                descricao: `Loop inativo por tempo crítico: ${Math.round(inactivityTime / 1000)}s`,
                prioridade: 'critica',
                dados: {
                    inactivityTime,
                    maxDowntime: this.config.maxDowntime,
                    lastActivity: this.status.lastLoopActivity,
                },
                usuarioCriador: 'leo-watchdog',
            });
            console.error(`[LeoWatchdog] Loop inativo por tempo crítico: ${Math.round(inactivityTime / 1000)}s`);
        }
        catch (error) {
            console.error('[LeoWatchdog] Erro ao lidar com inatividade prolongada:', error);
        }
    }
    /**
     * Tenta reiniciar o loop
     */
    async attemptRestart() {
        try {
            // Verificar se não excedeu o limite de tentativas
            if (this.status.restartAttempts >= this.config.maxRestartAttempts) {
                console.error(`[LeoWatchdog] Limite de tentativas de reinício atingido (${this.config.maxRestartAttempts})`);
                this.status.status = 'critical';
                // Registrar falha crítica
                await leoEvents.registerEvent({
                    tipo: 'erro_sistema',
                    descricao: `Watchdog não conseguiu reiniciar o loop após ${this.status.restartAttempts} tentativas`,
                    prioridade: 'critica',
                    dados: {
                        restartAttempts: this.status.restartAttempts,
                        maxRestartAttempts: this.config.maxRestartAttempts,
                        lastRestart: this.status.lastRestart,
                    },
                    usuarioCriador: 'leo-watchdog',
                });
                return;
            }
            // Verificar cooldown entre tentativas
            const timeSinceLastRestart = Date.now() - this.status.lastRestart.getTime();
            if (timeSinceLastRestart < this.config.restartCooldown) {
                const waitTime = this.config.restartCooldown - timeSinceLastRestart;
                console.log(`[LeoWatchdog] Aguardando cooldown de reinício: ${waitTime}ms`);
                // Aguardar cooldown
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            console.log(`[LeoWatchdog] Tentativa ${this.status.restartAttempts + 1}/${this.config.maxRestartAttempts} de reiniciar o loop...`);
            this.status.restartAttempts++;
            this.status.status = 'restarting';
            this.status.lastRestart = new Date();
            // Tentativa de reiniciar o loop
            const restartResult = await this.restartLoop();
            if (restartResult.success) {
                console.log(`✅ Loop reiniciado com sucesso (tentativa ${this.status.restartAttempts})`);
                this.status.status = 'healthy';
                // Registrar sucesso
                await leoEvents.registerEvent({
                    tipo: 'custom',
                    descricao: `Loop reiniciado com sucesso pelo watchdog (tentativa ${this.status.restartAttempts})`,
                    prioridade: 'media',
                    dados: {
                        restartAttempts: this.status.restartAttempts,
                        timeSinceLastRestart,
                    },
                    usuarioCriador: 'leo-watchdog',
                });
                // Resetar contador de tentativas após sucesso
                this.status.restartAttempts = 0;
            }
            else {
                console.error(`❌ Falha ao reiniciar o loop: ${restartResult.error}`);
                // Registrar falha
                await leoEvents.registerEvent({
                    tipo: 'erro_sistema',
                    descricao: `Falha ao reiniciar loop: ${restartResult.error}`,
                    prioridade: 'alta',
                    dados: {
                        restartAttempts: this.status.restartAttempts,
                        error: restartResult.error,
                    },
                    usuarioCriador: 'leo-watchdog',
                });
            }
        }
        catch (error) {
            console.error('[LeoWatchdog] Erro na tentativa de reinício:', error);
            this.status.status = 'critical';
            // Registrar erro
            await insertLeoActionLog({
                usuario: 'leo-watchdog',
                acao: 'erro_reiniciar_loop',
                entidade: 'leo_watchdog',
                dados: JSON.stringify({
                    error: error instanceof Error ? error.message : 'Erro desconhecido',
                    restartAttempts: this.status.restartAttempts,
                    timestamp: new Date(),
                }),
                resultado: 'ERRO',
            });
        }
    }
    /**
     * Reinicia o loop cognitivo
     */
    async restartLoop() {
        try {
            console.log('[LeoWatchdog] Reiniciando loop cognitivo...');
            // Parar loop atual
            await leoLoop.stopLeoLoop();
            // Aguardar um momento antes de reiniciar
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Reiniciar loop
            await leoLoop.startLeoLoop(5000);
            // Verificar se o loop está realmente rodando
            await new Promise(resolve => setTimeout(resolve, 2000));
            const newStatus = await leoLoop.getLoopStatus();
            if (!newStatus.running) {
                return { success: false, error: 'Loop não iniciou corretamente após reinício' };
            }
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido ao reiniciar loop'
            };
        }
    }
    /**
     * Atualiza configuração do watchdog
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[LeoWatchdog] Configuração atualizada:', this.config);
    }
    /**
     * Obtém status atual do watchdog
     */
    getStatus() {
        return { ...this.status };
    }
    /**
     * Força reinício manual do loop
     */
    async forceRestart() {
        try {
            console.log('[LeoWatchdog] Forçando reinício manual do loop...');
            // Resetar contador de tentativas
            this.status.restartAttempts = 0;
            // Reiniciar loop
            const result = await this.restartLoop();
            if (result.success) {
                this.status.status = 'healthy';
                return {
                    success: true,
                    message: 'Loop reiniciado manualmente com sucesso',
                };
            }
            else {
                return {
                    success: false,
                    message: `Falha ao reiniciar loop: ${result.error}`,
                };
            }
        }
        catch (error) {
            return {
                success: false,
                message: `Erro ao forçar reinício: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
            };
        }
    }
    /**
     * Inicializa o watchdog
     */
    initialize() {
        // Configurar handlers de erro do processo para o watchdog
        process.on('uncaughtException', (error) => {
            console.error('[LeoWatchdog] Exceção não capturada - tentando reiniciar loop...');
            this.attemptRestart().catch(console.error);
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('[LeoWatchdog] Promessa rejeitada - tentando reiniciar loop...');
            this.attemptRestart().catch(console.error);
        });
    }
}
// Exportar instância singleton
export const leoWatchdog = LeoWatchdog.getInstance();
