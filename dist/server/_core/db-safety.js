/**
 * Utilitários de segurança para queries Drizzle
 *
 * Evita queries abertas e garante limit/orderBy seguros
 */
import { sql } from "drizzle-orm";
/**
 * Valida e normaliza opções de query segura
 */
export function normalizeQueryOptions(options) {
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
export function safeLimit(limit, maxLimit = 1000) {
    const safeLimit = Math.min(Math.max(1, limit), maxLimit);
    return sql `LIMIT ${safeLimit}`;
}
/**
 * Adiciona cláusula OFFSET segura
 */
export function safeOffset(offset) {
    const safeOffset = Math.max(0, offset);
    return sql `OFFSET ${safeOffset}`;
}
/**
 * Cria resultado paginado seguro
 */
export function createPaginatedResult(data, total, options) {
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
    userId: (id) => {
        const num = Number(id);
        return Number.isInteger(num) && num > 0 ? num : null;
    },
    /**
     * Valida string de busca (previne SQL injection)
     */
    searchString: (str) => {
        if (typeof str !== 'string')
            return '';
        return str.trim().slice(0, 255);
    },
    /**
     * Valida email
     */
    email: (email) => {
        if (typeof email !== 'string')
            return null;
        const clean = email.trim().toLowerCase().slice(0, 320);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(clean) ? clean : null;
    },
    /**
     * Valida telefone
     */
    phone: (phone) => {
        if (typeof phone !== 'string')
            return '';
        return phone.replace(/\D/g, '').slice(0, 20);
    },
    /**
     * Valida valores monetários
     */
    monetary: (value) => {
        const num = Number(value);
        return Number.isFinite(num) && num >= 0 ? Number(num.toFixed(2)) : null;
    },
    /**
     * Valida data
     */
    date: (date) => {
        if (date instanceof Date)
            return date;
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
export function safeWhere(conditions) {
    const clean = {};
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
export function detectUnsafeQuery(sql) {
    const warnings = [];
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
