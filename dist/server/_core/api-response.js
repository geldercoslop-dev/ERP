import { z } from 'zod';
/**
 * Schema para validação de respostas da API
 */
export const ApiResponseSchema = z.object({
    success: z.boolean(),
    data: z.unknown().nullable(),
    error: z.object({
        code: z.string().optional(),
        message: z.string(),
        details: z.unknown().optional(),
        requestId: z.string().optional(),
        timestamp: z.string().optional(),
        route: z.string().optional()
    }).nullable(),
    meta: z.object({
        requestId: z.string().optional(),
        timestamp: z.string(),
        version: z.string(),
        pagination: z.object({
            page: z.number().optional(),
            pageSize: z.number().optional(),
            total: z.number().optional(),
            totalPages: z.number().optional(),
            hasNext: z.boolean().optional(),
            hasPrev: z.boolean().optional()
        }).optional(),
        performance: z.object({
            duration: z.number().optional(),
            queryCount: z.number().optional(),
            cacheHits: z.number().optional()
        }).optional()
    }).optional()
});
/**
 * Classe para construir respostas padronizadas
 */
export class ApiResponseBuilder {
    response = {
        success: true,
        data: undefined,
        error: undefined
    };
    meta = {
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    };
    /**
     * Define se a resposta é sucesso
     */
    success(isSuccess = true) {
        this.response.success = isSuccess;
        return this;
    }
    /**
     * Define os dados da resposta
     */
    data(data) {
        this.response.data = data;
        return this;
    }
    /**
     * Define erro na resposta
     */
    error(error) {
        this.response.success = false;
        this.response.error = {
            ...error,
            timestamp: new Date().toISOString()
        };
        return this;
    }
    /**
     * Define request ID
     */
    requestId(requestId) {
        this.meta.requestId = requestId;
        if (this.response.error) {
            this.response.error.requestId = requestId;
        }
        return this;
    }
    /**
     * Define paginação
     */
    pagination(pagination) {
        this.meta.pagination = pagination;
        return this;
    }
    /**
     * Define performance
     */
    performance(performance) {
        this.meta.performance = performance;
        return this;
    }
    /**
     * Define meta informações adicionais
     */
    setMeta(meta) {
        this.meta = { ...this.meta, ...meta };
        return this;
    }
    /**
     * Constrói a resposta final
     */
    build() {
        const finalResponse = {
            success: this.response.success ?? true,
            data: this.response.data,
            error: this.response.error || null,
            meta: Object.keys(this.meta).length > 0 ? this.meta : undefined
        };
        // Validar com Zod
        return ApiResponseSchema.parse(finalResponse);
    }
}
/**
 * Funções utilitárias para criar respostas comuns
 */
export const createApiResponse = {
    /**
     * Resposta de sucesso com dados
     */
    success: (data, options = {}) => {
        return new ApiResponseBuilder()
            .success(true)
            .data(data)
            .requestId(options.requestId || '')
            .pagination(options.pagination || {})
            .performance(options.performance || {})
            .build();
    },
    /**
     * Resposta de erro
     */
    error: (message, options = {}) => {
        return new ApiResponseBuilder()
            .success(false)
            .error({
            message,
            code: options.code,
            details: options.details,
            requestId: options.requestId,
            route: options.route
        })
            .requestId(options.requestId || '')
            .build();
    },
    /**
     * Resposta de sucesso sem dados
     */
    ok: (options = {}) => {
        return new ApiResponseBuilder()
            .success(true)
            .data({ message: options.message || 'Operação realizada com sucesso' })
            .requestId(options.requestId || '')
            .build();
    },
    /**
     * Resposta paginada
     */
    paginated: (data, pagination, options = {}) => {
        return new ApiResponseBuilder()
            .success(true)
            .data(data)
            .requestId(options.requestId || '')
            .pagination(pagination)
            .performance(options.performance || {})
            .build();
    },
    /**
     * Resposta de validação
     */
    validation: (errors, options = {}) => {
        return new ApiResponseBuilder()
            .success(false)
            .error({
            code: 'VALIDATION_ERROR',
            message: 'Erro de validação',
            details: errors,
            requestId: options.requestId,
            route: options.route
        })
            .requestId(options.requestId || '')
            .build();
    },
    /**
     * Resposta de não encontrado
     */
    notFound: (resource, id, options = {}) => {
        return new ApiResponseBuilder()
            .success(false)
            .error({
            code: 'RECORD_NOT_FOUND',
            message: `${resource}${id ? ` com ID ${id}` : ''} não encontrado`,
            details: { resource, id },
            requestId: options.requestId,
            route: options.route
        })
            .requestId(options.requestId || '')
            .build();
    },
    /**
     * Resposta de não autorizado
     */
    unauthorized: (message = 'Não autorizado', options = {}) => {
        return new ApiResponseBuilder()
            .success(false)
            .error({
            code: 'UNAUTHORIZED',
            message,
            requestId: options.requestId,
            route: options.route
        })
            .requestId(options.requestId || '')
            .build();
    },
    /**
     * Resposta de acesso negado
     */
    forbidden: (message = 'Acesso negado', options = {}) => {
        return new ApiResponseBuilder()
            .success(false)
            .error({
            code: 'FORBIDDEN',
            message,
            requestId: options.requestId,
            route: options.route
        })
            .requestId(options.requestId || '')
            .build();
    }
};
// Backwards-compatible named helpers (routers legacy imports)
export function createSuccessResponse(data, _message) {
    return createApiResponse.success(data);
}
export function createErrorResponse(message, options = {}) {
    return createApiResponse.error(message, options);
}
export function createPaginatedResponse(data, total, page, pageSize, _message) {
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    return createApiResponse.paginated(data, {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
    });
}
/**
 * Middleware para tRPC que padroniza respostas
 */
export function standardizeResponse(options) {
    const { result, ctx, path } = options;
    const requestId = ctx.requestId || 'unknown';
    const startTime = ctx.startTime || Date.now();
    const duration = Date.now() - startTime;
    // Se o resultado já for uma resposta padronizada, retornar como está
    if (result && typeof result === 'object' && 'success' in result) {
        return result;
    }
    // Padronizar resposta de sucesso
    return createApiResponse.success(result, {
        requestId,
        performance: { duration }
    });
}
/**
 * Função para criar wrapper de procedures com resposta padronizada
 */
export function withStandardResponse(procedure, handler) {
    return procedure
        .output(ApiResponseSchema)
        .use(async (opts) => {
        const { input, ctx } = opts;
        const startTime = Date.now();
        try {
            const result = await handler({ input, ctx });
            const duration = Date.now() - startTime;
            // Padronizar resposta
            return createApiResponse.success(result, {
                requestId: ctx.requestId,
                performance: { duration }
            });
        }
        catch (error) {
            // O middleware de erro vai tratar
            throw error;
        }
    });
}
