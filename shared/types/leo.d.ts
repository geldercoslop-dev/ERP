/**
 * Tipos centralizados do agente LEO
 * Eventos, memória, automação e ações do agente
 */
/** Payload genérico para jobs, ações e tarefas — usar em vez de any/unknown para dados estruturados */
export type GenericPayload = Record<string, unknown>;
/** Alias global para payload dinâmico (LEO, fila, decisões) */
export type Payload = Record<string, unknown>;
/** Padrão de retorno obrigatório para actions de desktop/automação (pós-remoção robotjs) */
export type ActionResult = {
    success: boolean;
    message: string;
};
export declare enum LeoEventType {
    COMANDO = "comando",
    PERCEPCAO = "percepcao",
    ACAO = "acao",
    MEMORIA = "memoria",
    ERRO = "erro"
}
export declare enum LeoEventStatus {
    ATIVO = "ativo",
    RESOLVIDO = "resolvido",
    IGNORADO = "ignorado"
}
export declare enum LeoEventPriority {
    BAIXA = "baixa",
    MEDIA = "media",
    ALTA = "alta",
    CRITICA = "critica"
}
export declare enum LeoMemoryType {
    EPISODICA = "episodica",
    SEMANTICA = "semantica",
    PROCEDURAL = "procedural",
    TRABALHO = "trabalho"
}
export declare enum LeoCommandOrigin {
    USUARIO = "usuario",
    SISTEMA = "sistema",
    AUTOMACAO = "automacao"
}
export declare enum LeoInsightType {
    PADRAO = "padrao",
    ANOMALIA = "anomalia",
    OPORTUNIDADE = "oportunidade",
    RISCO = "risco"
}
export declare enum LeoInsightImpact {
    BAIXO = "baixo",
    MEDIO = "medio",
    ALTO = "alto",
    CRITICO = "critico"
}
export declare enum LeoTaskType {
    ANALYSIS = "analysis",
    MONITORING = "monitoring",
    AUTOMATION = "automation",
    LEARNING = "learning",
    CLEANUP = "cleanup",
    EMERGENCY = "emergency"
}
export declare enum LeoTaskPriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum LeoTaskStatus {
    PENDING = "pending",
    RUNNING = "running",
    DONE = "done",
    ERROR = "error",
    BLOCKED = "blocked"
}
export interface LeoEvent {
    id: string;
    tipo: LeoEventType;
    titulo: string;
    descricao: string;
    dados?: unknown;
    contexto?: string;
    entidade?: string;
    entidadeId?: string;
    prioridade: LeoEventPriority;
    status: LeoEventStatus;
    usuarioResponsavel?: string;
    dataInicio?: Date;
    dataFim?: Date;
    dataCriacao: Date;
    dataUltimaAtualizacao: Date;
}
export interface LeoAction {
    id: string;
    type: string;
    description: string;
    parameters?: Payload;
    result?: unknown;
    status: 'pending' | 'running' | 'completed' | 'failed';
    timestamp: Date;
    userId?: string;
}
export interface LeoDecision {
    id: string;
    action: string;
    context: Payload;
    result: 'success' | 'failure' | 'partial';
    reasoning: string;
    confidence: number;
    timestamp: number;
    userId?: string;
}
export interface LeoMemoryRecord {
    id: string;
    type: LeoMemoryType;
    content: unknown;
    context?: string;
    timestamp: number;
    importance: number;
    tags?: string[];
}
export interface LeoTask {
    id: string;
    type: LeoTaskType;
    priority: LeoTaskPriority;
    payload: Payload;
    userId?: string;
    sessionId?: string;
    createdAt: Date;
    attempts: number;
    maxAttempts: number;
    delay?: number;
    timeout?: number;
    dependencies?: string[];
    status: LeoTaskStatus;
    result?: unknown;
    error?: string;
    executionTime?: number;
    processedAt?: Date;
}
export interface LeoInsight {
    id: string;
    type: LeoInsightType;
    title: string;
    description: string;
    impact: LeoInsightImpact;
    confidence: number;
    data: unknown;
    timestamp: Date;
    actionable: boolean;
}
export interface LeoContext {
    timestamp: number;
    system: unknown;
    erp: unknown;
    tasks: unknown;
    events: unknown;
    health: unknown;
    memory: unknown;
}
export interface ILeoLoop {
    startLeoLoop(intervalMs?: number): Promise<void>;
    stopLeoLoop(): Promise<void>;
    getLoopStatus(): Promise<unknown>;
}
export interface ILeoMemory {
    saveDecision(decision: Omit<LeoDecision, 'timestamp'>): Promise<void>;
    getRecentDecisions(limit?: number): Promise<LeoDecision[]>;
    addDecision(decision: Omit<LeoDecision, 'timestamp'>): Promise<void>;
    getRecentHistory(limit?: number): Promise<LeoDecision[]>;
}
export interface ILeoEvents {
    criarEvento(input: unknown): Promise<{
        success: boolean;
        eventId?: number;
        message: string;
    }>;
    /** @deprecated Use registerEvent */
    registrarEvento?(input: unknown): Promise<{
        success: boolean;
        eventId?: number;
        message: string;
    }>;
    registerEvent(input: unknown): Promise<LeoEvent>;
    /** @deprecated Use listEvents */
    listarEventos?(filtros?: unknown): Promise<{
        success: boolean;
        eventos?: LeoEvent[];
        message: string;
    }>;
    listEvents(filtros?: {
        tipo?: string;
        status?: string;
        usuarioResponsavel?: string;
        limit?: number;
    }): Promise<LeoEvent[]>;
    getEstatisticas?(): Promise<unknown>;
}
export interface ILeoTaskQueue {
    addTask(task: Omit<LeoTask, 'createdAt' | 'attempts' | 'processedAt' | 'result' | 'error' | 'executionTime'>): Promise<LeoTask>;
    listTasks(): Promise<LeoTask[]>;
    cancelTask(taskId: string): Promise<boolean>;
    cleanOldTasks(): Promise<number>;
    getStats(): Promise<unknown>;
}
/** Resultado da observação do ERP (observe()) */
export interface LeoObserveResult {
    success: boolean;
    events?: LeoEvent[];
    context?: Payload;
    error?: string;
}
export interface ILeoErpObserver {
    observe(): Promise<LeoObserveResult>;
    collectErpContext(): Promise<Payload>;
    getLastContext(): Payload | null;
}
export interface CreateEventInput {
    tipo: LeoEventType;
    titulo?: string;
    descricao: string;
    dados?: unknown;
    contexto?: string;
    entidade?: string;
    entidadeId?: string;
    prioridade?: LeoEventPriority;
    status?: LeoEventStatus;
    usuarioResponsavel?: string;
    dataInicio?: Date;
    dataFim?: Date;
    usuarioCriador?: string;
}
export interface CreateTaskInput {
    type: LeoTaskType;
    priority: LeoTaskPriority;
    payload: Payload;
    userId?: string;
    sessionId?: string;
    maxAttempts?: number;
    delay?: number;
    timeout?: number;
    dependencies?: string[];
}
