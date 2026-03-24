/**
 * Validação e segurança para memória do LEO
 * 
 * Garante integridade de dados e timestamps
 */

import { z } from 'zod';
import { MemoryType, MemoryImportance } from '../leo/memory/leo-long-memory';

/**
 * Schema de validação para entradas de memória
 */
export const memoryEntrySchema = z.object({
  type: z.enum(['event', 'decision', 'insight', 'pattern', 'alert', 'strategy']),
  content: z.string().min(1, 'Conteúdo é obrigatório').max(10000, 'Conteúdo muito longo'),
  context: z.string().max(2000, 'Contexto muito longo').optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  createdAt: z.date().optional(),
});

export const createMemoryInputSchema = z.object({
  type: z.enum(['event', 'decision', 'insight', 'pattern', 'alert', 'strategy']),
  content: z.string().min(1, 'Conteúdo é obrigatório').max(10000, 'Conteúdo muito longo'),
  context: z.string().max(2000, 'Contexto muito longo').optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

export type SafeMemoryEntry = z.infer<typeof memoryEntrySchema>;
export type SafeCreateMemoryInput = z.infer<typeof createMemoryInputSchema>;

/**
 * Validações de integridade
 */
export class LeoMemorySafety {
  /**
   * Valida entrada de memória
   */
  static validateMemoryInput(input: unknown): SafeCreateMemoryInput {
    return createMemoryInputSchema.parse(input);
  }

  /**
   * Valida e sanitiza conteúdo
   */
  static sanitizeContent(content: string): string {
    return content
      .trim()
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove caracteres de controle
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .slice(0, 10000); // Limita tamanho
  }

  /**
   * Valida timestamp
   */
  static validateTimestamp(timestamp: any): Date {
    if (timestamp instanceof Date && !isNaN(timestamp.getTime())) {
      return timestamp;
    }
    
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    
    const parsed = new Date(timestamp);
    if (isNaN(parsed.getTime())) {
      return now;
    }
    
    // Garante que timestamp seja razoável
    if (parsed < oneYearAgo || parsed > oneYearFromNow) {
      return now;
    }
    
    return parsed;
  }

  /**
   * Valida importância
   */
  static validateImportance(importance: any): MemoryImportance {
    const valid = ['low', 'medium', 'high', 'critical'];
    return valid.includes(importance) ? importance : 'medium';
  }

  /**
   * Detecta conteúdo suspeito ou malicioso
   */
  static detectSuspiciousContent(content: string): string[] {
    const warnings: string[] = [];
    
    // Padrões suspeitos
    const suspiciousPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /data:text\/html/gi,
      /eval\s*\(/gi,
      /exec\s*\(/gi,
    ];
    
    // Verifica conteúdo muito longo sem espaços
    if (content.length > 5000 && content.split(/\s+/).length < 10) {
      warnings.push('Conteúdo muito longo com poucos espaços');
    }
    
    // Verifica repetição excessiva
    const words = content.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
    
    const maxRepeats = Math.max(...wordCounts.values());
    if (maxRepeats > words.length * 0.3) {
      warnings.push('Repetição excessiva de palavras');
    }
    
    // Verifica padrões suspeitos
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        warnings.push(`Padrão suspeito detectado: ${pattern.source}`);
      }
    }
    
    return warnings;
  }

  /**
   * Gera hash para verificação de integridade
   */
  static generateIntegrityHash(entry: SafeMemoryEntry): string {
    const crypto = require('crypto');
    const data = JSON.stringify({
      type: entry.type,
      content: entry.content,
      context: entry.context,
      importance: entry.importance,
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verifica integridade da entrada
   */
  static verifyIntegrity(entry: SafeMemoryEntry, expectedHash: string): boolean {
    const actualHash = this.generateIntegrityHash(entry);
    return actualHash === expectedHash;
  }

  /**
   * Valida consulta de busca
   */
  static validateSearchQuery(query: unknown): string {
    if (typeof query !== 'string') {
      return '';
    }
    
    return this.sanitizeContent(query.trim()).slice(0, 100);
  }

  /**
   * Valida parâmetros de paginação
   */
  static validatePaginationParams(limit?: unknown, offset?: unknown): { limit: number; offset: number } {
    const parsedLimit = Number(limit) || 20;
    const parsedOffset = Number(offset) || 0;
    
    return {
      limit: Math.min(Math.max(1, parsedLimit), 100),
      offset: Math.max(0, parsedOffset),
    };
  }

  /**
   * Valida tipo de memória
   */
  static validateMemoryType(type: unknown): MemoryType {
    const validTypes: MemoryType[] = ['event', 'decision', 'insight', 'pattern', 'alert', 'strategy'];
    return validTypes.includes(type as MemoryType) ? type as MemoryType : 'event';
  }
}

/**
 * Wrapper para operações seguras com memória
 */
export function withMemorySafety<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  return operation().catch(error => {
    console.error(`[Memory Safety] Erro em ${context}:`, error);
    
    // Log específico para erros de memória
    console.error('[Memory Safety] Detalhes do erro:', {
      context,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    throw error;
  });
}
