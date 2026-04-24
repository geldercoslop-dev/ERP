/**
 * Scheduler Robusto do LEO
 *
 * Sistema responsável por executar tarefas recorrentes
 * Suporta expressões cron e agendamento inteligente
 */
import { leoTaskQueue } from '../tasks/leo-task-queue.js';
import { LeoTaskPriority, LeoTaskStatus } from '../types.js';
import { insertLeoLegacyActionLog } from '../../services/leo-action-log.service.js';
import { ValidationError, InfrastructureError } from '../../_core/errors/typed-errors.js';
import { leoEvents } from '../memory/leo-events.js';
async function insertLeoActionLog(params) {
    await insertLeoLegacyActionLog(params);
}
/**
 * Parser de expressões cron simplificado
 */
class CronParser {
    static parse(schedule) {
        // Formatos suportados:
        // "5 * * * *" - 5 minutos de cada hora
        // "0 9 * * *" - 9:00 todos os dias
        // "0 9 * * 1-5" - 9:00 dias de semana
        // "0 0 1 * *" - Todo dia 1
        // "*/15 * * * *" - A cada 15 minutos
        const parts = schedule.split(' ');
        if (parts.length !== 5) {
            throw new ValidationError(`Expressão cron inválida: ${schedule}`);
        }
        const [minPart, hourPart, dayPart, monthPart, weekdayPart] = parts;
        return {
            minutes: this.parsePart(minPart ?? '*', 0, 59),
            hours: this.parsePart(hourPart ?? '*', 0, 23),
            days: this.parsePart(dayPart ?? '*', 1, 31),
            months: this.parsePart(monthPart ?? '*', 1, 12),
            weekdays: this.parsePart(weekdayPart ?? '*', 0, 6),
        };
    }
    static parsePart(part, min, max) {
        if (part === '*') {
            return Array.from({ length: max - min + 1 }, (_, i) => i + min);
        }
        if (part.startsWith('*/')) {
            const step = parseInt(part.substring(2));
            return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + (i * step));
        }
        if (part.includes('-')) {
            const parsed = part.split('-').map((n) => parseInt(n, 10));
            const start = parsed[0] ?? min;
            const end = parsed[1] ?? max;
            return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        }
        if (part.includes(',')) {
            return part.split(',').map((n) => parseInt(n, 10));
        }
        const value = parseInt(part);
        return isNaN(value) ? [] : [value];
    }
    static getNextRun(schedule, from = new Date()) {
        try {
            const cron = this.parse(schedule);
            const next = new Date(from);
            // Adicionar 1 minuto para evitar execução imediata
            next.setMinutes(next.getMinutes() + 1);
            next.setSeconds(0);
            next.setMilliseconds(0);
            // Procurar próxima data correspondente (limitado a 1 ano)
            for (let i = 0; i < 365 * 24 * 60; i++) {
                if (this.matchesCron(next, cron)) {
                    return next;
                }
                next.setMinutes(next.getMinutes() + 1);
            }
            throw new InfrastructureError('Não foi possível encontrar próxima data de execução');
        }
        catch (error) {
            // Fallback para 1 hora se expressão for inválida
            const fallback = new Date(from);
            fallback.setHours(fallback.getHours() + 1);
            return fallback;
        }
    }
    static matchesCron(date, cron) {
        return cron.minutes.includes(date.getMinutes()) &&
            cron.hours.includes(date.getHours()) &&
            cron.days.includes(date.getDate()) &&
            cron.months.includes(date.getMonth() + 1) &&
            cron.weekdays.includes(date.getDay());
    }
}
/**
 * Scheduler robusto do Leo
 */
class LeoScheduler {
    static instance;
    scheduledTasks = new Map();
    isRunning = false;
    schedulerInterval;
    CHECK_INTERVAL = 60000; // Verificar a cada minuto
    constructor() {
        this.loadScheduledTasks();
    }
    static getInstance() {
        if (!LeoScheduler.instance) {
            LeoScheduler.instance = new LeoScheduler();
        }
        return LeoScheduler.instance;
    }
    /**
     * Inicia o scheduler
     */
    async start() {
        try {
            if (this.isRunning) {
                return {
                    success: false,
                    message: 'Scheduler já está em execução',
                };
            }
            console.log('⏰ Iniciando Leo Scheduler...');
            this.isRunning = true;
            // Iniciar verificação contínua
            this.schedulerInterval = setInterval(async () => {
                await this.checkAndRunScheduledTasks();
            }, this.CHECK_INTERVAL);
            // Verificar imediatamente
            await this.checkAndRunScheduledTasks();
            await insertLeoActionLog({
                usuario: 'leo-scheduler',
                acao: 'iniciar_scheduler',
                entidade: 'leo_scheduler',
                dados: JSON.stringify({
                    timestamp: new Date(),
                    tasksCount: this.scheduledTasks.size,
                }),
                resultado: 'SUCESSO',
            });
            return {
                success: true,
                message: `Scheduler iniciado com ${this.scheduledTasks.size} tarefas agendadas`,
            };
        }
        catch (error) {
            console.error('[LeoScheduler] Erro ao iniciar:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao iniciar scheduler',
            };
        }
    }
    /**
     * Para o scheduler
     */
    async stop() {
        try {
            if (!this.isRunning) {
                return {
                    success: false,
                    message: 'Scheduler não está em execução',
                };
            }
            console.log('⏹️ Parando Leo Scheduler...');
            this.isRunning = false;
            if (this.schedulerInterval) {
                clearInterval(this.schedulerInterval);
                this.schedulerInterval = undefined;
            }
            await insertLeoActionLog({
                usuario: 'leo-scheduler',
                acao: 'parar_scheduler',
                entidade: 'leo_scheduler',
                dados: JSON.stringify({
                    timestamp: new Date(),
                }),
                resultado: 'SUCESSO',
            });
            return {
                success: true,
                message: 'Scheduler parado com sucesso',
            };
        }
        catch (error) {
            console.error('[LeoScheduler] Erro ao parar:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao parar scheduler',
            };
        }
    }
    /**
     * Adiciona tarefa agendada
     */
    async addScheduledTask(task) {
        try {
            const scheduledTask = {
                id: this.generateTaskId(),
                name: task.name,
                type: task.type,
                schedule: task.schedule,
                payload: task.payload,
                priority: task.priority,
                enabled: task.enabled,
                lastRun: task.lastRun,
                nextRun: CronParser.getNextRun(task.schedule),
                runCount: 0,
                errorCount: 0,
                maxErrors: task.maxErrors || 5,
                timeout: task.timeout || 300000, // 5 minutos padrão
                createdBy: task.createdBy || 'leo-system',
                description: task.description,
                timezone: task.timezone || 'America/Sao_Paulo',
            };
            this.scheduledTasks.set(scheduledTask.id, scheduledTask);
            this.saveScheduledTasks();
            console.log(`📅 Tarefa agendada adicionada: ${scheduledTask.name} (${scheduledTask.schedule}) - Próxima execução: ${scheduledTask.nextRun.toLocaleString()}`);
            await insertLeoActionLog({
                usuario: scheduledTask.createdBy || 'leo-system',
                acao: 'adicionar_tarefa_agendada',
                entidade: 'leo_scheduler',
                dados: JSON.stringify({
                    taskId: scheduledTask.id,
                    name: scheduledTask.name,
                    schedule: scheduledTask.schedule,
                    nextRun: scheduledTask.nextRun,
                }),
                resultado: 'SUCESSO',
            });
            return scheduledTask;
        }
        catch (error) {
            console.error('[LeoScheduler] Erro ao adicionar tarefa agendada:', error);
            throw error;
        }
    }
    /**
     * Remove tarefa agendada
     */
    async removeScheduledTask(taskId) {
        const task = this.scheduledTasks.get(taskId);
        if (!task) {
            return false;
        }
        this.scheduledTasks.delete(taskId);
        this.saveScheduledTasks();
        console.log(`🗑️ Tarefa agendada removida: ${task.name}`);
        await insertLeoActionLog({
            usuario: 'leo-scheduler',
            acao: 'remover_tarefa_agendada',
            entidade: 'leo_scheduler',
            dados: JSON.stringify({
                taskId,
                name: task.name,
            }),
            resultado: 'SUCESSO',
        });
        return true;
    }
    /**
     * Atualiza tarefa agendada
     */
    async updateScheduledTask(taskId, updates) {
        const task = this.scheduledTasks.get(taskId);
        if (!task) {
            return false;
        }
        const updatedTask = { ...task, ...updates };
        // Recalcular próxima execução se schedule mudou
        if (updates.schedule && updates.schedule !== task.schedule) {
            updatedTask.nextRun = CronParser.getNextRun(updates.schedule);
        }
        this.scheduledTasks.set(taskId, updatedTask);
        this.saveScheduledTasks();
        console.log(`✏️ Tarefa agendada atualizada: ${updatedTask.name}`);
        return true;
    }
    /**
     * Verifica e executa tarefas agendadas
     */
    async checkAndRunScheduledTasks() {
        if (!this.isRunning)
            return;
        const now = new Date();
        const tasksToRun = [];
        // Encontrar tarefas que devem ser executadas
        for (const task of Array.from(this.scheduledTasks.values())) {
            if (task.enabled && task.nextRun <= now) {
                tasksToRun.push(task);
            }
        }
        if (tasksToRun.length === 0)
            return;
        console.log(`⏰ Executando ${tasksToRun.length} tarefa(s) agendada(s)...`);
        // Executar tarefas em paralelo
        const promises = tasksToRun.map((task) => this.runScheduledTask(task));
        await Promise.allSettled(promises);
    }
    /**
     * Executa uma tarefa agendada
     */
    async runScheduledTask(task) {
        const startTime = Date.now();
        try {
            console.log(`⏰ Executando tarefa agendada: ${task.name}`);
            // Adicionar à fila de tarefas
            const success = await leoTaskQueue.addTask({
                id: `scheduled_${task.id}_${Date.now()}`,
                type: task.type,
                priority: this.mapPriorityToLeoTaskPriority(task.priority),
                payload: task.payload,
                userId: task.createdBy,
                sessionId: 'scheduler',
                maxAttempts: 3,
                timeout: task.timeout,
                status: LeoTaskStatus.PENDING
            });
            if (success) {
                task.lastRun = new Date();
                task.runCount++;
                task.errorCount = 0; // Reset error count on success
                // Calcular próximo horário de execução
                task.nextRun = this.calculateNextRun(task.schedule);
                console.log(`✅ Tarefa ${task.name} executada com sucesso`);
            }
            else {
                task.errorCount++;
                console.log(`❌ Falha ao enfileirar tarefa ${task.name}`);
            }
        }
        catch (error) {
            task.errorCount++;
            console.error(`❌ Erro ao executar tarefa agendada: ${task.name}`, error);
            // Desabilitar tarefa se excedeu limite de erros
            if (task.errorCount >= (task.maxErrors || 5)) {
                task.enabled = false;
                await leoEvents.registerEvent({
                    tipo: 'scheduler_tarefa_desabilitada',
                    descricao: `Tarefa agendada "${task.name}" desabilitada após ${task.errorCount} erros`,
                    prioridade: 'media',
                    dados: {
                        taskId: task.id,
                        name: task.name,
                        errorCount: task.errorCount,
                        maxErrors: task.maxErrors,
                    },
                    usuarioCriador: 'leo-scheduler',
                });
            }
            // Registrar erro
            await insertLeoActionLog({
                usuario: 'leo-scheduler',
                acao: 'erro_tarefa_agendada',
                entidade: 'leo_scheduler',
                dados: JSON.stringify({
                    taskId: task.id,
                    name: task.name,
                    error: error instanceof Error ? error.message : error,
                    errorCount: task.errorCount,
                    enabled: task.enabled,
                }),
                resultado: 'ERRO',
            });
        }
        this.saveScheduledTasks();
    }
    /**
     * Lista tarefas agendadas
     */
    getScheduledTasks() {
        return Array.from(this.scheduledTasks.values());
    }
    /**
     * Cria tarefas padrão do sistema
     */
    async createDefaultTasks() {
        const defaultTasks = [
            {
                name: 'Análise de Vendas Horária',
                type: 'analisar_vendas',
                schedule: '0 * * * *', // Cada hora
                priority: 'media',
                enabled: true,
                description: 'Analisa vendas e detecta anomalias a cada hora',
                payload: { timeframe: '1h' },
            },
            {
                name: 'Verificação de Estoque',
                type: 'verificar_estoque_critico',
                schedule: '*/10 * * * *', // A cada 10 minutos
                priority: 'alta',
                enabled: true,
                description: 'Verifica produtos com estoque crítico',
                payload: { threshold: 10 },
            },
            {
                name: 'Relatório Diário',
                type: 'gerar_relatorio_diario',
                schedule: '0 18 * * *', // 18:00 todos os dias
                priority: 'media',
                enabled: true,
                description: 'Gera relatório diário das operações',
                payload: { type: 'daily_summary' },
            },
            {
                name: 'Limpeza de Logs',
                type: 'limpar_logs_antigos',
                schedule: '0 2 * * *', // 2:00 todos os dias
                priority: 'baixa',
                enabled: true,
                description: 'Limpa logs antigos do sistema (mantém 30 dias)',
                payload: { maxAge: 30 },
            },
            {
                name: 'Limpeza de Arquivos Temporários',
                type: 'limpar_arquivos_temporarios',
                schedule: '0 3 * * *', // 3:00 todos os dias
                priority: 'baixa',
                enabled: true,
                description: 'Limpa arquivos temporários antigos (mantém 48 horas)',
                payload: { maxAgeHours: 48 },
            },
            {
                name: 'Monitoramento de Sistema',
                type: 'verificar_saude_sistema',
                schedule: '*/5 * * * *', // A cada 5 minutos
                priority: 'critica',
                enabled: true,
                description: 'Monitora saúde do sistema',
                payload: { detailed: false },
            },
        ];
        for (const taskData of defaultTasks) {
            try {
                // Verificar se já existe
                const existing = Array.from(this.scheduledTasks.values())
                    .find(t => t.name === taskData.name);
                if (!existing) {
                    await this.addScheduledTask(taskData);
                    console.log(`✓ Tarefa padrão criada: ${taskData.name}`);
                }
            }
            catch (error) {
                console.error(`Erro ao criar tarefa padrão ${taskData.name}:`, error);
            }
        }
    }
    /**
     * Gera ID único para tarefa agendada
     */
    generateTaskId() {
        return `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Salva tarefas agendadas em arquivo
     */
    saveScheduledTasks() {
        try {
            const fs = require('fs');
            const path = require('path');
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            const filePath = path.join(dataDir, 'leo-scheduled-tasks.json');
            const tasksArray = Array.from(this.scheduledTasks.values());
            fs.writeFileSync(filePath, JSON.stringify(tasksArray, null, 2));
        }
        catch (error) {
            console.error('[LeoScheduler] Erro ao salvar tarefas agendadas:', error);
        }
    }
    /**
     * Carrega tarefas agendadas do arquivo
     */
    loadScheduledTasks() {
        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(process.cwd(), 'data', 'leo-scheduled-tasks.json');
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                const tasksData = JSON.parse(data);
                this.scheduledTasks.clear();
                for (const taskData of tasksData) {
                    // Converter strings de data para objetos Date
                    taskData.lastRun = taskData.lastRun ? new Date(taskData.lastRun) : undefined;
                    taskData.nextRun = new Date(taskData.nextRun);
                    this.scheduledTasks.set(taskData.id, taskData);
                }
                console.log(`📁 Carregadas ${this.scheduledTasks.size} tarefas agendadas`);
            }
        }
        catch (error) {
            console.error('[LeoScheduler] Erro ao carregar tarefas agendadas:', error);
        }
    }
    /**
     * Mapeia prioridade do scheduler para LeoTaskPriority
     */
    mapPriorityToLeoTaskPriority(priority) {
        switch (priority) {
            case 'critica': return LeoTaskPriority.CRITICAL;
            case 'alta': return LeoTaskPriority.HIGH;
            case 'media': return LeoTaskPriority.MEDIUM;
            case 'baixa': return LeoTaskPriority.LOW;
            default: return LeoTaskPriority.MEDIUM;
        }
    }
    /**
     * Calcula próxima data de execução baseado no schedule
     */
    calculateNextRun(schedule) {
        const now = new Date();
        // Implementação simplificada - apenas adicionar 1 hora para exemplo
        const nextRun = new Date(now.getTime() + 60 * 60 * 1000);
        return nextRun;
    }
    /**
     * Obtém estatísticas do scheduler
     */
    getStats() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        const tasksRunToday = Array.from(this.scheduledTasks.values())
            .filter(task => task.lastRun && task.lastRun >= todayStart && task.lastRun < todayEnd)
            .length;
        const tasksFailedToday = Array.from(this.scheduledTasks.values())
            .filter(task => task.lastRun && task.lastRun >= todayStart && task.lastRun < todayEnd && task.errorCount > 0)
            .length;
        const nextRuns = Array.from(this.scheduledTasks.values())
            .filter(task => task.enabled)
            .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
            .slice(0, 5)
            .map(task => ({ task: task.name, when: task.nextRun }));
        return {
            totalTasks: this.scheduledTasks.size,
            enabledTasks: Array.from(this.scheduledTasks.values()).filter(task => task.enabled).length,
            disabledTasks: Array.from(this.scheduledTasks.values()).filter(task => !task.enabled).length,
            tasksRunToday,
            tasksFailedToday,
            averageRunTime: 0, // Poderia ser calculado
            nextRuns
        };
    }
}
// Exportar instância singleton
export const leoScheduler = LeoScheduler.getInstance();
