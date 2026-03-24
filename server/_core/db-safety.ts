/**
 * Utilitários de segurança para queries Drizzle
 * 
 * Evita queries abertas e garante limit/orderBy seguros
 */

import { sql, desc, asc } from "drizzle-orm";

export interface SafeQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
  defaultLimit?: number;
  maxLimit?: number;
}

/**
 * Valida e normaliza opções de query segura
 */
export function normalizeQueryOptions(options?: SafeQueryOptions): Required<Omit<SafeQueryOptions, 'orderBy'>> & { orderBy: 'asc' | 'desc' } {
  const defaultLimit = options?.defaultLimit || 50;
  const maxLimit = options?.maxLimit || 1000;
  
  let limit = options?.limit || defaultLimit;
  if (limit > maxLimit) {
    limit = maxLimit;
  }
  if (limit < 1) {
    limit = 1;
  }
  
  let offset = options?.offset || 0;
  if (offset < 0) {
    offset = 0;
  }
  
  return {
    limit,
    offset,
    orderBy: options?.orderBy || 'desc',
    defaultLimit,
    maxLimit,
  };
}

/**
 * Adiciona cláusula LIMIT segura
 */
export function safeLimit(limit: number, maxLimit: number = 1000) {
  const safeLimit = Math.min(Math.max(1, limit), maxLimit);
  return sql`LIMIT ${safeLimit}`;
}

/**
 * Adiciona cláusula OFFSET segura
 */
export function safeOffset(offset: number) {
  const safeOffset = Math.max(0, offset);
  return sql`OFFSET ${safeOffset}`;
}

/**
 * Wrapper para queries com paginação segura
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Cria resultado paginado seguro
 */
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  options: Required<Omit<SafeQueryOptions, 'orderBy'>> & { orderBy: 'asc' | 'desc' }
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / options.limit);
  const page = Math.floor(options.offset / options.limit) + 1;
  
  return {
    data,
    pagination: {
      page,
      limit: options.limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Validações de segurança para campos comuns
 */
export const SafeValidators = {
  /**
   * Valida ID de usuário
   */
  userId: (id: any): number | null => {
    const num = Number(id);
    return Number.isInteger(num) && num > 0 ? num : null;
  },
  
  /**
   * Valida string de busca (previne SQL injection)
   */
  searchString: (str: any): string => {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, 255);
  },
  
  /**
   * Valida email
   */
  email: (email: any): string | null => {
    if (typeof email !== 'string') return null;
    const clean = email.trim().toLowerCase().slice(0, 320);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(clean) ? clean : null;
  },
  
  /**
   * Valida telefone
   */
  phone: (phone: any): string => {
    if (typeof phone !== 'string') return '';
    return phone.replace(/\D/g, '').slice(0, 20);
  },
  
  /**
   * Valida valores monetários
   */
  monetary: (value: any): number | null => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? Number(num.toFixed(2)) : null;
  },
  
  /**
   * Valida data
   */
  date: (date: any): Date | null => {
    if (date instanceof Date) return date;
    if (typeof date === 'string' || typeof date === 'number') {
      const d = new Date(date);
      return !isNaN(d.getTime()) ? d : null;
    }
    return null;
  },
};

/**
 * Constrói WHERE clause segura
 */
export function safeWhere(conditions: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(conditions)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    
    clean[key] = value;
  }
  
  return clean;
}

/**
 * Detecta queries potencialmente perigosas
 */
export function detectUnsafeQuery(sql: string): string[] {
  const warnings: string[] = [];
  const dangerousPatterns = [
    /DROP\s+TABLE/i,
    /DELETE\s+FROM\s+\w+\s*$/i,
    /UPDATE\s+\w+\s+SET/i,
    /INSERT\s+INTO/i,
    /--/,
    /\/\*/,
    /\*\//,
    /UNION\s+SELECT/i,
    /EXEC\s*\(/i,
    /xp_cmdshell/i,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      warnings.push(`Padrão perigoso detectado: ${pattern.source}`);
    }
  }
  
  return warnings;
}
