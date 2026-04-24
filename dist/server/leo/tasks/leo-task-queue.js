/**
 * Fila de Tarefas do LEO (Implementação Simplificada)
 *
 * Sistema de gerenciamento de tarefas assíncronas com prioridade
 * Implementa processamento em fila para evitar overload do loop
 */
import { EventEmitter } from 'events';
import { rotationLogger } from '../../_core/logger-rotation.js';
import { ValidationError } from '../../_core/errors/typed-errors.js';
import { LeoTaskType, LeoTaskPriority, LeoTaskStatus } from '../types.js';
import { insertLeoLegacyActionLog } from "../../services/leo-action-log.service.js";
async function insertLeoActionLog(params) {
    await insertLeoLegacyActionLog(params);
}
/**
 * Gerenciador de fila de tarefas do LEO (Implementação Interna)
 */
class LeoTaskQueue extends EventEmitter {
    static instance;
    tasks = new Map();
    maxQueueSize = 1000;
    isProcessing = false;
    processingInterval;
    constructor() {
        super();
        rotationLogger.info('Inicializando fila de tarefas do LEO (implementação interna)');
    }
    static getInstance() {
        if (!LeoTaskQueue.instance) {
            LeoTaskQueue.instance = new LeoTaskQueue();
        }
        return LeoTaskQueue.instance;
    }
    /**
     * Converte prioridade para score numérico
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
     * Inicia o processamento da fila
     */
    async start() {
        if (this.isProcessing) {
            rotationLogger.info('Fila de tarefas já está ativa');
            return;
        }
        this.isProcessing = true;
        rotationLogger.info('Iniciando processamento da fila de tarefas');
        // Iniciar loop de processamento
        this.processingInterval = setInterval(() => {
            this.processNextTask();
        }, 1000); // Verificar a cada segundo
        rotationLogger.info('Processamento da fila iniciado');
        this.emit('started');
    }
    /**
     * Para o processamento da fila
     */
    async stop() {
        if (!this.isProcessing) {
            rotationLogger.info('Fila de tarefas já está parada');
            return;
        }
        this.isProcessing = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = undefined;
        }
        rotationLogger.info('Processamento da fila parado');
        this.emit('stopped');
    }
    /**
     * Adiciona uma tarefa simples (interface padrão)
     */
    addSimpleTask(task) {
        const typeStr = String(task.type);
        const resolvedType = typeStr === 'planning' ? LeoTaskType.ANALYSIS : typeStr === 'execution' ? LeoTaskType.AUTOMATION : task.type;
        const fullTask = {
            ...task,
            priority: LeoTaskPriority.MEDIUM,
            maxAttempts: 3,
            attempts: 0,
            status: LeoTaskStatus.PENDING,
            type: resolvedType
        };
        this.tasks.set(fullTask.id, fullTask);
        rotationLogger.info(`Tarefa simples adicionada: ${fullTask.id}`);
    }
    /**
     * Processa uma tarefa específica
     */
    async processTask(task) {
        try {
            task.status = LeoTaskStatus.RUNNING;
            const result = await this.executeTask(task);
            task.status = result.success ? LeoTaskStatus.DONE : LeoTaskStatus.ERROR;
            task.processedAt = new Date();
            task.result = result.result;
            task.error = result.error;
            task.executionTime = result.executionTime;
            rotationLogger.info(`Tarefa processada: ${task.id} - ${task.status}`);
        }
        catch (error) {
            task.status = LeoTaskStatus.ERROR;
            task.error = error instanceof Error ? error.message : 'Erro desconhecido';
            rotationLogger.error(`Erro ao processar tarefa ${task.id}: ${task.error}`);
        }
    }
    /**
     * Adiciona uma tarefa à fila
     */
    async addTask(task) {
        const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const taskWithId = {
            ...task,
            id: taskId,
            createdAt: new Date(),
            attempts: 0,
            maxAttempts: task.maxAttempts || 3,
            status: LeoTaskStatus.PENDING,
        };
        // Verificar tamanho máximo da fila
        if (this.tasks.size >= this.maxQueueSize) {
            // Remover tarefas antigas de baixa prioridade
            const tasksArray = Array.from(this.tasks.values())
                .sort((a, b) => this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority))
                .slice(0, this.maxQueueSize - 1);
            this.tasks.clear();
            tasksArray.forEach(task => {
                this.tasks.set(task.id, task);
            });
            rotationLogger.warn(`Fila cheia - removendo ${tasksArray.length} tarefas antigas`);
        }
        // Adicionar nova tarefa
        this.tasks.set(taskWithId.id, taskWithId);
        rotationLogger.info(`Tarefa adicionada: ${taskWithId.id} (${taskWithId.type})`);
        this.emit('taskAdded', taskWithId);
        return taskWithId;
    }
    /**
     * Processa a próxima tarefa na fila
     */
    async processNextTask() {
        if (this.tasks.size === 0) {
            return;
        }
        // Encontrar próxima tarefa por prioridade
        const tasksArray = Array.from(this.tasks.values())
            .sort((a, b) => this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority));
        const nextTask = tasksArray[0];
        if (!nextTask) {
            return;
        }
        // Remover da fila
        this.tasks.delete(nextTask.id);
        nextTask.status = LeoTaskStatus.RUNNING;
        nextTask.attempts = 1;
        rotationLogger.info(`Processando tarefa: ${nextTask.id} (${nextTask.type})`);
        this.emit('taskStarted', nextTask);
        try {
            // Executar tarefa com timeout
            const result = await this.executeTaskWithTimeout(nextTask);
            nextTask.status = result.success ? LeoTaskStatus.DONE : LeoTaskStatus.ERROR;
            nextTask.processedAt = new Date();
            nextTask.result = result.result;
            nextTask.error = result.error;
            nextTask.executionTime = result.executionTime;
            rotationLogger.info(`Tarefa concluída: ${nextTask.id} (${nextTask.status})`);
            this.emit('taskCompleted', nextTask);
            // Registrar no banco
            await insertLeoActionLog({
                usuario: nextTask.userId || 'leo-queue',
                acao: 'processar_tarefa',
                entidade: nextTask.type,
                dados: JSON.stringify({
                    taskId: nextTask.id,
                    type: nextTask.type,
                    payload: nextTask.payload,
                    result: result.result,
                    executionTime: result.executionTime
                }),
                resultado: result.success ? 'SUCESSO' : 'ERRO'
            });
        }
        catch (error) {
            // Lidar com falhas
            nextTask.status = LeoTaskStatus.ERROR;
            nextTask.processedAt = new Date();
            nextTask.error = error instanceof Error ? error.message : 'Erro desconhecido';
            rotationLogger.error(`Erro na tarefa ${nextTask.id}: ${nextTask.error}`);
            this.emit('taskFailed', nextTask);
            // Se falhou e ainda tem tentativas, retornar à fila (retry automático)
            if (nextTask.attempts < nextTask.maxAttempts) {
                nextTask.status = LeoTaskStatus.PENDING;
                nextTask.delay = (nextTask.delay || 1000) * nextTask.attempts;
                // Adicionar de volta à fila com delay
                setTimeout(() => {
                    this.tasks.set(nextTask.id, nextTask);
                }, nextTask.delay);
                rotationLogger.info(`Tarefa ${nextTask.id} retornou à fila com delay de ${nextTask.delay}ms`);
            }
            else {
                // Excluir tarefa permanentemente
                this.tasks.delete(nextTask.id);
                rotationLogger.error(`Tarefa ${nextTask.id} excluída após ${nextTask.maxAttempts} tentativas`);
            }
        }
    }
    /**
     * Executa tarefa com timeout
     */
    async executeTaskWithTimeout(task) {
        const startTime = Date.now();
        const timeout = task.timeout || 30000; // 30 segundos padrão
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Timeout da tarefa após ${timeout}ms`));
            }, timeout);
            this.executeTask(task)
                .then(result => {
                clearTimeout(timeoutId);
                resolve({
                    ...result,
                    executionTime: Date.now() - startTime,
                    processedAt: new Date()
                });
            })
                .catch(error => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }
    /**
     * Executa uma tarefa específica
     */
    async executeTask(task) {
        try {
            // Implementar lógica baseada no tipo
            switch (task.type) {
                case 'analysis':
                    return await this.executeAnalysisTask(task);
                case 'monitoring':
                    return await this.executeMonitoringTask(task);
                case 'automation':
                    return await this.executeAutomationTask(task);
                case 'learning':
                    return await this.executeLearningTask(task);
                case 'cleanup':
                    return await this.executeCleanupTask(task);
                case 'emergency':
                    return await this.executeEmergencyTask(task);
                default:
                    throw new ValidationError(`Tipo de tarefa não suportado: ${task.type}`);
            }
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido',
                executionTime: Date.now() - Date.now(),
                processedAt: new Date()
            };
        }
    }
    /**
     * Executa tarefa de análise
     */
    async executeAnalysisTask(task) {
        return {
            success: true,
            result: {
                type: 'analysis',
                timestamp: new Date(),
                insights: ['Análise executada com sucesso'],
                data: task.payload
            },
            executionTime: Date.now() - Date.now(),
            processedAt: new Date()
        };
    }
    /**
     * Executa tarefa de monitoramento
     */
    async executeMonitoringTask(task) {
        return {
            success: true,
            result: {
                type: 'monitoring',
                timestamp: new Date(),
                status: 'ok',
                metrics: {
                    memory: process.memoryUsage(),
                    uptime: process.uptime()
                },
                data: task.payload
            },
            executionTime: Date.now() - Date.now(),
            processedAt: new Date()
        };
    }
    /**
     * Executa tarefa de automação
     */
    async executeAutomationTask(task) {
        return {
            success: true,
            result: {
                type: 'automation',
                timestamp: new Date(),
                actions: ['Automação executada'],
                data: task.payload
            },
            executionTime: Date.now() - Date.now(),
            processedAt: new Date()
        };
    }
    /**
     * Executa tarefa de aprendizado
     */
    async executeLearningTask(task) {
        return {
            success: true,
            result: {
                type: 'learning',
                timestamp: new Date(),
                insights: ['Aprendizado executado com sucesso'],
                data: task.payload
            },
            executionTime: Date.now() - Date.now(),
            processedAt: new Date()
        };
    }
    /**
     * Executa tarefa de limpeza
     */
    async executeCleanupTask(task) {
        return {
            success: true,
            result: {
                type: 'cleanup',
                timestamp: new Date(),
                actions: ['Limpeza executada'],
                data: task.payload
            },
            executionTime: Date.now() - Date.now(),
            processedAt: new Date()
        };
    }
    /**
     * Executa tarefa de emergência
     */
    async executeEmergencyTask(task) {
        return {
            success: true,
            result: {
                type: 'emergency',
                timestamp: new Date(),
                actions: ['Ação emergencial executada'],
                data: task.payload
            },
            executionTime: Date.now() - Date.now(),
            processedAt: new Date()
        };
    }
    /**
     * Obtém estatísticas da fila
     */
    getStats() {
        const tasksArray = Array.from(this.tasks.values());
        const stats = {
            total: tasksArray.length,
            pending: tasksArray.filter((t) => t.status === LeoTaskStatus.PENDING).length,
            running: tasksArray.filter((t) => t.status === LeoTaskStatus.RUNNING).length,
            done: tasksArray.filter((t) => t.status === LeoTaskStatus.DONE).length,
            error: tasksArray.filter((t) => t.status === LeoTaskStatus.ERROR).length,
            byType: tasksArray.reduce((acc, task) => {
                acc[task.type] = (acc[task.type] || 0) + 1;
                return acc;
            }, {}),
            byPriority: tasksArray.reduce((acc, task) => {
                acc[task.priority] = (acc[task.priority] || 0) + 1;
                return acc;
            }, {})
        };
        return stats;
    }
    /**
     * Limpa todas as tarefas
     */
    clearAllTasks() {
        this.tasks.clear();
        rotationLogger.info('Todas as tarefas removidas da fila');
        this.emit('cleared');
    }
    /**
     * Remove uma tarefa específica
     */
    removeTask(taskId) {
        const removed = this.tasks.delete(taskId);
        if (removed) {
            rotationLogger.info(`Tarefa ${taskId} removida da fila`);
            this.emit('taskRemoved', taskId);
        }
        return removed;
    }
    /**
     * Obtém próxima tarefa
     */
    getNextTask() {
        const tasksArray = Array.from(this.tasks.values())
            .sort((a, b) => this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority));
        return tasksArray.length > 0 ? tasksArray[0] ?? null : null;
    }
    /**
     * Lista tarefas com filtros
     */
    listTasks(filters) {
        let tasks = Array.from(this.tasks.values());
        // Aplicar filtros
        if (filters?.status) {
            tasks = tasks.filter((t) => t.status === filters.status);
        }
        if (filters?.type) {
            tasks = tasks.filter((t) => t.type === filters.type);
        }
        if (filters?.priority) {
            const priorityMap = {
                'baixa': 'low',
                'media': 'medium',
                'alta': 'high'
            };
            const mappedPriority = priorityMap[filters.priority];
            if (mappedPriority) {
                tasks = tasks.filter((t) => t.priority === mappedPriority);
            }
        }
        // Ordenar por prioridade
        tasks.sort((a, b) => this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority));
        // Limitar resultados
        if (filters?.limit) {
            tasks = tasks.slice(0, filters.limit);
        }
        return tasks;
    }
    /**
     * Cancela uma tarefa
     */
    cancelTask(taskId) {
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
        rotationLogger.info(`Tarefa ${taskId} cancelada`);
        this.emit('taskCancelled', taskId);
        return true;
    }
    /**
     * Limpa tarefas antigas
     */
    cleanOldTasks(maxAge = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        const tasksToRemove = [];
        for (const [taskId, task] of Array.from(this.tasks.entries())) {
            const taskAge = now - task.createdAt.getTime();
            // Remove tarefas concluídas ou com erro mais antigas que maxAge
            if ((task.status === LeoTaskStatus.DONE || task.status === LeoTaskStatus.ERROR) && taskAge > maxAge) {
                tasksToRemove.push(taskId);
            }
        }
        tasksToRemove.forEach(taskId => this.tasks.delete(taskId));
        if (tasksToRemove.length > 0) {
            rotationLogger.info(`${tasksToRemove.length} tarefas antigas removidas`);
            this.emit('oldTasksCleaned', tasksToRemove.length);
        }
        return tasksToRemove.length;
    }
    /**
     * Encerra o sistema de filas
     */
    shutdown() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = undefined;
        }
        this.isProcessing = false;
        this.tasks.clear();
        rotationLogger.info('Sistema de filas encerrado');
        this.emit('shutdown');
    }
}
// Exportar instância singleton
export const leoTaskQueue = LeoTaskQueue.getInstance();
