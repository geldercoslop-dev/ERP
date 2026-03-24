/**
 * Schema para Memória Semântica do LEO
 */

import { 
  mysqlTable, 
  varchar, 
  text, 
  timestamp, 
  int, 
  decimal, 
  json,
  index
} from 'drizzle-orm/mysql-core';

// Tabela de eventos semânticos
export const semanticMemoryEvents = mysqlTable('semantic_memory_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tipo: varchar('tipo', { length: 50 }).notNull(),
  contexto: varchar('contexto', { length: 100 }).notNull(),
  entidade: varchar('entidade', { length: 100 }).notNull(),
  entidade_id: varchar('entidade_id', { length: 100 }),
  dados: json('dados'),
  timestamp: timestamp('timestamp').notNull(),
  usuario: varchar('usuario', { length: 100 }).default('leo'),
  confianca: decimal('confianca', { precision: 3, scale: 2 }).notNull(),
  importancia: varchar('importancia', { length: 20 }).notNull(),
}, (table) => ({
  idx_tipo: index('idx_tipo').on(table.tipo),
  idx_contexto: index('idx_contexto').on(table.contexto),
  idx_entidade: index('idx_entidade').on(table.entidade),
  idx_timestamp: index('idx_timestamp').on(table.timestamp),
  idx_importancia: index('idx_importancia').on(table.importancia),
}));

// Tabela de padrões identificados
export const semanticMemoryPatterns = mysqlTable('semantic_memory_patterns', {
  id: varchar('id', { length: 36 }).primaryKey(),
  nome: varchar('nome', { length: 200 }).notNull(),
  descricao: text('descricao'),
  tipo: varchar('tipo', { length: 50 }).notNull(),
  contexto: varchar('contexto', { length: 100 }).notNull(),
  condicoes: json('condicoes'),
  frequencia: int('frequencia').notNull(),
  confianca: decimal('confianca', { precision: 3, scale: 2 }).notNull(),
  criado_em: timestamp('criado_em').notNull(),
  atualizado_em: timestamp('atualizado_em').notNull(),
  valido_ate: timestamp('valido_ate'),
}, (table) => ({
  idx_tipo: index('idx_tipo').on(table.tipo),
  idx_contexto: index('idx_contexto').on(table.contexto),
  idx_frequencia: index('idx_frequencia').on(table.frequencia),
  idx_confianca: index('idx_confianca').on(table.confianca),
}));

// Tabela de resumos gerados
export const semanticMemorySummaries = mysqlTable('semantic_memory_summaries', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tipo: varchar('tipo', { length: 20 }).notNull(),
  periodo: json('periodo').notNull(),
  contexto: varchar('contexto', { length: 100 }).notNull(),
  resumo: text('resumo'),
  dados: json('dados'),
  criado_em: timestamp('criado_em').notNull(),
  gerado_por: varchar('gerado_por', { length: 100 }).notNull(),
  confianca: decimal('confianca', { precision: 3, scale: 2 }).notNull(),
}, (table) => ({
  idx_tipo: index('idx_tipo').on(table.tipo),
  idx_contexto: index('idx_contexto').on(table.contexto),
  idx_criado_em: index('idx_criado_em').on(table.criado_em),
}));

/** Tipo mínimo para execução de SQL (evita import do server/db neste módulo). */
type DbLike = { execute: (sql: string) => Promise<unknown> };

/**
 * Cria as tabelas de memória semântica.
 * Deve ser chamada passando getDb do server (ex.: import { getDb } from '../db'; createSemanticMemoryTables(getDb)).
 */
export async function createSemanticMemoryTables(getDb: () => Promise<DbLike | null>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Criar tabelas se não existirem
    await db.execute(`
      CREATE TABLE IF NOT EXISTS semantic_memory_events (
        id VARCHAR(36) PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL,
        contexto VARCHAR(100) NOT NULL,
        entidade VARCHAR(100) NOT NULL,
        entidade_id VARCHAR(100),
        JSON dados,
        TIMESTAMP timestamp NOT NULL,
        VARCHAR(100) DEFAULT 'leo',
        DECIMAL(3,2) confianca NOT NULL,
        VARCHAR(20) NOT NULL,
        
        INDEX idx_tipo (tipo),
        INDEX idx_contexto (contexto),
        INDEX idx_entidade (entidade),
        INDEX idx_timestamp (timestamp),
        INDEX idx_importancia (importancia)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS semantic_memory_patterns (
        id VARCHAR(36) PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        TEXT descricao,
        VARCHAR(50) NOT NULL tipo,
        VARCHAR(100) NOT NULL contexto,
        JSON condicoes,
        INT frequencia NOT NULL,
        DECIMAL(3,2) confianca NOT NULL,
        TIMESTAMP criado_em NOT NULL,
        TIMESTAMP atualizado_em NOT NULL,
        TIMESTAMP valido_ate,
        
        INDEX idx_tipo (tipo),
        INDEX idx_contexto (contexto),
        INDEX idx_frequencia (frequencia),
        INDEX idx_confianca (confianca)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS semantic_memory_summaries (
        id VARCHAR(36) PRIMARY KEY,
        tipo VARCHAR(20) NOT NULL,
        JSON periodo NOT NULL,
        VARCHAR(100) NOT NULL contexto,
        TEXT resumo,
        JSON dados,
        TIMESTAMP criado_em NOT NULL,
        VARCHAR(100) NOT NULL gerado_por,
        DECIMAL(3,2) confianca NOT NULL,
        
        INDEX idx_tipo (tipo),
        INDEX idx_contexto (contexto),
        INDEX idx_criado_em (criado_em)
      )
    `);

    console.log('Tabelas de memória semântica criadas com sucesso');
  } catch (error) {
    console.error('Erro ao criar tabelas de memória semântica:', error);
    throw error;
  }
}
