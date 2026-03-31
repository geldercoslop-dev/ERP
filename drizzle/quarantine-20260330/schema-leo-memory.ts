/**
 * Schema para tabela de memória do LEO
 * 
 * Armazena decisões, aprendizados e contexto do agente LEO
 * para persistência e recuperação de dados
 */

import { pgTable, serial, text, timestamp, integer, json, index, Index } from 'drizzle-orm/pg-core';

// Tabela principal de memória do LEO
export const leoMemory = pgTable('leo_memory', {
  id: serial('id').primaryKey(),
  
  // Tipo de memória
  type: text('type').notNull(), // 'decision', 'task', 'error', 'pattern', 'insight'
  
  // Conteúdo principal
  content: text('content').notNull(),
  
  // Metadados em JSON
  metadata: json('metadata').$type<{
    action?: string;
    success?: boolean;
    executionTime?: number;
    context?: any;
    parameters?: any;
    result?: any;
    error?: string;
    confidence?: number;
    priority?: string;
    userId?: string;
    entityId?: string;
  }>(),
  
  // Contexto da memória
  context: text('context').$type<{
    tasksCount?: number;
    eventsCount?: number;
    healthStatus?: string;
    systemLoad?: number;
    userRole?: string;
    businessMetrics?: any;
  }>(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  
  // Índices para performance
  expiresAt: timestamp('expires_at'), // Para limpeza automática
  
  // Campos de busca e classificação
  tags: text('tags').array(), // Tags para categorização
  importance: integer('importance').default(1), // 1-10, para prioridade
  accessCount: integer('access_count').default(0), // Contador de acessos
  
  // Relacionamentos (opcional, para futuras expansões)
  sessionId: text('session_id'), // ID da sessão LEO
  parentMemoryId: integer('parent_memory_id'), // Para memórias relacionadas
});

// Tabela de eventos do LEO (já existe, mas vamos garantir schema)
export const leoEvents = pgTable('leo_events', {
  id: serial('id').primaryKey(),
  tipo: text('tipo').notNull(),
  descricao: text('descricao').notNull(),
  prioridade: text('prioridade').notNull(), // 'baixa', 'media', 'alta', 'critica'
  dados: json('dados'),
  status: text('status').default('aberto'), // 'aberto', 'em_andamento', 'resolvido', 'ignorado'
  usuarioCriador: text('usuario_criador'),
  usuarioResponsavel: text('usuario_responsavel'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  resolvidoEm: timestamp('resolvido_em'),
});

// Tabela de aprendizado do LEO
export const leoLearning = pgTable('leo_learning', {
  id: serial('id').primaryKey(),
  
  // Tipo de aprendizado
  learningType: text('learning_type').notNull(), // 'pattern', 'insight', 'optimization', 'error_analysis'
  
  // Conteúdo do aprendizado
  content: text('content').notNull(),
  
  // Contexto do aprendizado
  context: json('context').$type<{
    taskType?: string;
    complexity?: number;
    successRate?: number;
    avgExecutionTime?: number;
    conditions?: any;
  }>(),
  
  // Métricas de performance
  performance: json('performance').$type<{
    successRate?: number;
    avgTime?: number;
    totalExecutions?: number;
    lastExecution?: Date;
    improvement?: number; // Percentual de melhoria
  }>(),
  
  // Recomendações geradas
  recommendations: text('recommendations').array(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  
  // Validade do aprendizado
  validUntil: timestamp('valid_until'),
  confidence: integer('confidence').default(50), // 0-100
  
  // Aplicabilidade
  applicableTo: text('applicable_to').array(), // Tipos de tarefas onde se aplica
  
  // Status
  status: text('status').default('active'), // 'active', 'deprecated', 'experimental'
});

// Índices para performance
export const leoMemoryIndexes = {
  // Índices para busca por tipo e data
  typeCreatedAtIdx: index('idx_leo_memory_type_created_at').on(leoMemory.type, leoMemory.createdAt),
  
  // Índice para busca por importância
  importanceIdx: index('idx_leo_memory_importance').on(leoMemory.importance),
  
  // Índice para busca por tags
  tagsIdx: index('idx_leo_memory_tags').on(leoMemory.tags),
  
  // Índice para busca por contexto
  contextIdx: index('idx_leo_memory_context').on(leoMemory.context),
  
  // Índice para limpeza automática
  expiresAtIdx: index('idx_leo_memory_expires_at').on(leoMemory.expiresAt),
  
  // Índice para sessão
  sessionIdIdx: index('idx_leo_memory_session_id').on(leoMemory.sessionId),
};

export const leoEventsIndexes = {
  // Índices para eventos
  statusIdx: index('idx_leo_events_status').on(leoEvents.status),
  priorityIdx: index('idx_leo_events_prioridade').on(leoEvents.prioridade),
  createdAtIdx: index('idx_leo_events_created_at').on(leoEvents.createdAt),
  tipoIdx: index('idx_leo_events_tipo').on(leoEvents.tipo),
};

export const leoLearningIndexes = {
  // Índices para aprendizado
  learningTypeIdx: index('idx_leo_learning_learning_type').on(leoLearning.learningType),
  statusIdx: index('idx_leo_learning_status').on(leoLearning.status),
  confidenceIdx: index('idx_leo_learning_confidence').on(leoLearning.confidence),
  validUntilIdx: index('idx_leo_learning_valid_until').on(leoLearning.validUntil),
};

// Tipos TypeScript para as tabelas
export type LeoMemory = typeof leoMemory.$inferSelect;
export type LeoMemoryInsert = typeof leoMemory.$inferInsert;
export type LeoEvents = typeof leoEvents.$inferSelect;
export type LeoEventsInsert = typeof leoEvents.$inferInsert;
export type LeoLearning = typeof leoLearning.$inferSelect;
export type LeoLearningInsert = typeof leoLearning.$inferInsert;
