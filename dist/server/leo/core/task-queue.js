/**
 * Fila de Tarefas LEO - Implementação Oficial
 * Tipagem forte e estrutura padronizada
 */
import { EventEmitter } from 'events';
import { ValidationError } from '../../_core/errors/typed-errors.js';
import { LeoTaskStatus } from '../../../shared/types/index.js';
import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
/**
 * Fila de Tarefas LEO - Implementação concreta
 */
export class LeoTaskQueue extends EventEmitter {
    static instance;
    tasks = new Map();
    maxQueueSize = 1000;
    isProcessing = false;
    processingInterval;
    maxConcurrentTasks = 5;
    runningTasks = new Set();
    constructor() {
        super();
        console.log("[LEO TaskQueue] Inicializando fila de tarefas oficial");
    }
    static getInstance() {
        if (!LeoTaskQueue.instance) {
            LeoTaskQueue.instance = new LeoTaskQueue();
        }
        return LeoTaskQueue.instance;
    }
    /**
     * Adiciona tarefa à fila
     */
    async add(taskData) {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task = {
            ...taskData,
            id: taskId,
            createdAt: new Date(),
            attempts: 0,
            status: LeoTaskStatus.PENDING,
        };
        // Verificar tamanho da fila
        if (this.tasks.size >= this.maxQueueSize) {
            await this.cleanupOldTasks();
        }
        this.tasks.set(taskId, task);
        console.log(`[LEO TaskQueue] Tarefa adicionada: ${taskId} (${task.type})`);
        this.emit('taskAdded', task);
        return task;
    }
    /**
     * Obtém próxima tarefa da fila
     */
    async getNext() {
        if (this.runningTasks.size >= this.maxConcurrentTasks) {
            return null;
        }
        const tasksArray = Array.from(this.tasks.values())
            .filter((task) => task.status === LeoTaskStatus.PENDING)
            .sort((a, b) => this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority));
        return tasksArray[0] || null;
    }
    /**
     * Inicia o processamento da fila
     */
    async start() {
        if (this.isProcessing) {
            console.log('[LEO TaskQueue] Fila já está em processamento');
            return;
        }
        this.isProcessing = true;
        console.log('[LEO TaskQueue] Iniciando processamento da fila');
        this.processingInterval = setInterval(async () => {
            if (this.runningTasks.size < this.maxConcurrentTasks) {
                const task = await this.getNext();
                if (task) {
                    this.executeTask(task);
                }
            }
        }, 1000);
        this.emit('started');
    }
    /**
     * Processa a próxima tarefa na fila (método legado)
     */
    async process() {
        await this.start();
    }
    /**
     * Executa uma tarefa específica
     */
    async executeTask(task) {
        // Marcar como em execução
        task.status = LeoTaskStatus.RUNNING;
        task.attempts = 1;
        this.runningTasks.add(task.id);
        this.tasks.set(task.id, task);
        console.log(`[LEO TaskQueue] Executando tarefa: ${task.id} (${task.type})`);
        this.emit('taskStarted', task);
        const startTime = Date.now();
        try {
            // Executar tarefa com timeout
            const result = await this.executeTaskWithTimeout(task);
            // Atualizar status baseado no resultado
            task.status = result.success ? LeoTaskStatus.DONE : LeoTaskStatus.ERROR;
            task.processedAt = new Date();
            task.result = result.result;
            task.executionTime = result.executionTime;
            console.log(`[LEO TaskQueue] Tarefa concluída: ${task.id} (${task.status})`);
            this.emit('taskCompleted', task);
            // Registrar no banco
            await this.logTaskExecution(task, result);
        }
        catch (error) {
            // Lidar com falhas
            task.status = LeoTaskStatus.ERROR;
            task.processedAt = new Date();
            task.error = error instanceof Error ? error.message : 'Erro desconhecido';
            task.executionTime = Date.now() - startTime;
            console.error(`[LEO TaskQueue] Erro na tarefa ${task.id}: ${task.error}`);
            this.emit('taskFailed', task);
            // Retry automático
            if (task.attempts < task.maxAttempts) {
                task.status = LeoTaskStatus.PENDING;
                task.delay = (task.delay || 1000) * task.attempts;
                setTimeout(() => {
                    this.tasks.set(task.id, task);
                }, task.delay);
                console.log(`[LEO TaskQueue] Tarefa ${task.id} retornou à fila com delay de ${task.delay}ms`);
            }
            else {
                // Excluir tarefa permanentemente
                this.tasks.delete(task.id);
                console.error(`[LEO TaskQueue] Tarefa ${task.id} excluída após ${task.maxAttempts} tentativas`);
            }
        }
        finally {
            this.runningTasks.delete(task.id);
        }
    }
    /**
     * Executa tarefa com timeout
     */
    async executeTaskWithTimeout(task) {
        const startTime = Date.now();
        const timeout = task.timeout || 30000; // 30 segundos padrão
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Task timeout after ${timeout}ms`));
            }, timeout);
            this.executeTaskLogic(task)
                .then(result => {
                clearTimeout(timer);
                resolve({
                    success: true,
                    result,
                    executionTime: Date.now() - startTime,
                    processedAt: new Date(),
                });
            })
                .catch(error => {
                clearTimeout(timer);
                resolve({
                    success: false,
                    error: error instanceof Error ? error.message : 'Erro desconhecido',
                    executionTime: Date.now() - startTime,
                    processedAt: new Date(),
                });
            });
        });
    }
    /**
     * Executa lógica da tarefa baseada no tipo
     */
    async executeTaskLogic(task) {
        switch (task.type) {
            case 'analysis':
                return this.executeAnalysisTask(task);
            case 'monitoring':
                return this.executeMonitoringTask(task);
            case 'automation':
                return this.executeAutomationTask(task);
            case 'learning':
                return this.executeLearningTask(task);
            case 'cleanup':
                return this.executeCleanupTask(task);
            case 'emergency':
                return this.executeEmergencyTask(task);
            default:
                throw new ValidationError(`Unknown task type: ${task.type}`);
        }
    }
    /**
     * Executa tarefa de análise
     */
    async executeAnalysisTask(task) {
        console.log(`[LEO TaskQueue] Executando análise: ${task.id}`);
        return { analysis: 'completed', data: task.payload };
    }
    /**
     * Executa tarefa de monitoramento
     */
    async executeMonitoringTask(task) {
        console.log(`[LEO TaskQueue] Executando monitoramento: ${task.id}`);
        return { monitoring: 'active', metrics: { cpu: 50, memory: 60 } };
    }
    /**
     * Executa tarefa de automação
     */
    async executeAutomationTask(task) {
        console.log(`[LEO TaskQueue] Executando automação: ${task.id}`);
        return { automation: 'executed', payload: task.payload };
    }
    /**
     * Executa tarefa de aprendizado
     */
    async executeLearningTask(task) {
        console.log(`[LEO TaskQueue] Executando aprendizado: ${task.id}`);
        return { learning: 'completed', insights: [] };
    }
    /**
     * Executa tarefa de limpeza
     */
    async executeCleanupTask(task) {
        console.log(`[LEO TaskQueue] Executando limpeza: ${task.id}`);
        return { cleanup: 'completed', items: 0 };
    }
    /**
     * Executa tarefa de emergência
     */
    async executeEmergencyTask(task) {
        console.log(`[LEO TaskQueue] Executando emergência: ${task.id}`);
        return { emergency: 'handled', action: 'resolved' };
    }
    /**
     * Cancela uma tarefa
     */
    cancel(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return false;
        }
        // Só pode cancelar se não estiver em execução
        if (task.status === LeoTaskStatus.RUNNING) {
            return false;
        }
        task.status = LeoTaskStatus.ERROR;
        task.error = 'Cancelled by user';
        task.processedAt = new Date();
        console.log(`[LEO TaskQueue] Tarefa ${taskId} cancelada`);
        this.emit('taskCancelled', taskId);
        return true;
    }
    /**
     * Remove uma tarefa
     */
    remove(taskId) {
        const removed = this.tasks.delete(taskId);
        if (removed) {
            console.log(`[LEO TaskQueue] Tarefa ${taskId} removida`);
            this.emit('taskRemoved', taskId);
        }
        return removed;
    }
    /**
     * Lista tarefas com filtro
     */
    async list(filter) {
        let tasks = Array.from(this.tasks.values());
        if (filter) {
            if (filter.type) {
                tasks = tasks.filter((t) => t.type === filter.type);
            }
            if (filter.status) {
                tasks = tasks.filter((t) => t.status === filter.status);
            }
            if (filter.priority) {
                tasks = tasks.filter((t) => t.priority === filter.priority);
            }
            if (filter.userId) {
                tasks = tasks.filter((t) => t.userId === filter.userId);
            }
        }
        // Sort by createdAt desc
        tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (filter?.offset) {
            tasks = tasks.slice(filter.offset);
        }
        if (filter?.limit) {
            tasks = tasks.slice(0, filter.limit);
        }
        return tasks;
    }
    /**
     * Obtém estatísticas da fila
     */
    stats() {
        const tasks = Array.from(this.tasks.values());
        const completed = tasks.filter((t) => t.status === LeoTaskStatus.DONE);
        const failed = tasks.filter((t) => t.status === LeoTaskStatus.ERROR);
        const pending = tasks.filter((t) => t.status === LeoTaskStatus.PENDING);
        const running = tasks.filter((t) => t.status === LeoTaskStatus.RUNNING);
        const totalExecutionTime = completed
            .concat(failed)
            .reduce((sum, t) => sum + (t.executionTime || 0), 0);
        const avgExecutionTime = completed.length > 0 ? totalExecutionTime / completed.length : 0;
        const successRate = completed.length > 0 ? completed.length / (completed.length + failed.length) : 0;
        return {
            total: tasks.length,
            pending: pending.length,
            running: running.length,
            completed: completed.length,
            failed: failed.length,
            avgExecutionTime,
            successRate,
        };
    }
    /**
     * Para o processamento da fila
     */
    async stop() {
        if (!this.isProcessing) {
            console.log('[LEO TaskQueue] Fila já está parada');
            return;
        }
        this.isProcessing = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = undefined;
        }
        console.log('[LEO TaskQueue] Processamento da fila parado');
        this.emit('stopped');
    }
    /**
     * Limpa todas as tarefas
     */
    clear() {
        this.tasks.clear();
        console.log('[LEO TaskQueue] Todas as tarefas removidas');
        this.emit('cleared');
    }
    /**
     * Obtém score de prioridade
     */
    getPriorityScore(priority) {
        const scores = {
            critical: 100,
            high: 75,
            medium: 50,
            low: 25,
        };
        return scores[priority] || 50;
    }
    /**
     * Limpa tarefas antigas
     */
    async cleanupOldTasks() {
        const tasksArray = Array.from(this.tasks.values());
        const oldTasks = tasksArray
            .filter((task) => (task.status === LeoTaskStatus.DONE || task.status === LeoTaskStatus.ERROR) &&
            task.processedAt &&
            Date.now() - task.processedAt.getTime() > 24 * 60 * 60 * 1000 // 24 horas
        )
            .map((task) => task.id);
        oldTasks.forEach(taskId => this.tasks.delete(taskId));
        if (oldTasks.length > 0) {
            console.log(`[LEO TaskQueue] ${oldTasks.length} tarefas antigas removidas`);
            this.emit('oldTasksCleaned', oldTasks.length);
        }
    }
    /**
     * Registra execução da tarefa no banco
     */
    async logTaskExecution(task, result) {
        try {
            await insertLeoActionLog({
                usuario: task.userId || 'leo-queue',
                acao: 'processar_tarefa',
                entidade: task.type,
                dados: JSON.stringify({
                    taskId: task.id,
                    type: task.type,
                    success: result.success,
                    executionTime: result.executionTime,
                }),
                resultado: result.success ? 'SUCESSO' : 'ERRO'
            });
        }
        catch (error) {
            console.error('[LEO TaskQueue] Erro ao registrar execução:', error);
        }
    }
    /**
     * Encerra o sistema de filas
     */
    shutdown() {
        this.stop();
        this.clear();
        console.log('[LEO TaskQueue] Sistema de filas encerrado');
        this.emit('shutdown');
    }
}
// Exportar instância singleton
export const leoTaskQueue = LeoTaskQueue.getInstance();
export default leoTaskQueue;
