import { z } from 'zod';

/**
 * Schema para validação de respostas da API
 */
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().nullable(),
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
 * Tipo de resposta da API
 */
export type ApiResponse<T = unknown> = z.infer<typeof ApiResponseSchema> & {
  data?: T;
};

/**
 * Classe para construir respostas padronizadas
 */
export class ApiResponseBuilder<T = unknown> {
  private response: Partial<ApiResponse<T>> = {
    success: true,
    data: null,
    error: null
  };

  private meta: {
    timestamp: string;
    version: string;
    requestId?: string;
    pagination?: Record<string, unknown>;
    performance?: Record<string, unknown>;
  } = {
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  };

  /**
   * Define se a resposta é sucesso
   */
  success(isSuccess: boolean = true): this {
    this.response.success = isSuccess;
    return this;
  }

  /**
   * Define os dados da resposta
   */
  data(data: T): this {
    this.response.data = data;
    return this;
  }

  /**
   * Define erro na resposta
   */
  error(error: {
    code?: string;
    message: string;
    details?: unknown;
    requestId?: string;
    route?: string;
  }): this {
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
  requestId(requestId: string): this {
    this.meta.requestId = requestId;
    if (this.response.error) {
      this.response.error.requestId = requestId;
    }
    return this;
  }

  /**
   * Define paginação
   */
  pagination(pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  }): this {
    this.meta.pagination = pagination;
    return this;
  }

  /**
   * Define performance
   */
  performance(performance: {
    duration: number;
    queryCount?: number;
    cacheHits?: number;
  }): this {
    this.meta.performance = performance;
    return this;
  }

  /**
   * Define meta informações adicionais
   */
  setMeta(meta: Partial<NonNullable<ApiResponse['meta']>>): this {
    this.meta = { ...this.meta, ...meta };
    return this;
  }

  /**
   * Constrói a resposta final
   */
  build(): ApiResponse<T> {
    const finalResponse: ApiResponse<T> = {
      success: this.response.success ?? true,
      data: this.response.data ?? null,
      error: this.response.error ?? null,
      meta: Object.keys(this.meta).length > 0 ? this.meta : undefined
    };

    // Validar com Zod
    return ApiResponseSchema.parse(finalResponse) as ApiResponse<T>;
  }
}

/**
 * Funções utilitárias para criar respostas comuns
 */
export const createApiResponse = {
  /**
   * Resposta de sucesso com dados
   */
  success: <T = any>(
    data: T,
    options: {
      requestId?: string;
      pagination?: any;
      performance?: any;
    } = {}
  ): ApiResponse<T> => {
    return new ApiResponseBuilder<T>()
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
  error: (
    message: string,
    options: {
      code?: string;
      details?: any;
      requestId?: string;
      route?: string;
    } = {}
  ): ApiResponse => {
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
  ok: (options: {
    requestId?: string;
    message?: string;
  } = {}): ApiResponse => {
    return new ApiResponseBuilder()
      .success(true)
      .data({ message: options.message || 'Operação realizada com sucesso' })
      .requestId(options.requestId || '')
      .build();
  },

  /**
   * Resposta paginada
   */
  paginated: <T = any>(
    data: T[],
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages?: number;
      hasNext?: boolean;
      hasPrev?: boolean;
    },
    options: {
      requestId?: string;
      performance?: any;
    } = {}
  ): ApiResponse<T[]> => {
    return new ApiResponseBuilder<T[]>()
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
  validation: (
    errors: Array<{ field: string; message: string }>,
    options: {
      requestId?: string;
      route?: string;
    } = {}
  ): ApiResponse => {
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
  notFound: (
    resource: string,
    id?: any,
    options: {
      requestId?: string;
      route?: string;
    } = {}
  ): ApiResponse => {
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
  unauthorized: (
    message: string = 'Não autorizado',
    options: {
      requestId?: string;
      route?: string;
    } = {}
  ): ApiResponse => {
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
  forbidden: (
    message: string = 'Acesso negado',
    options: {
      requestId?: string;
      route?: string;
    } = {}
  ): ApiResponse => {
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
export function createSuccessResponse<T>(
  data: T,
  _message?: string
): ApiResponse<T> {
  return createApiResponse.success<T>(data);
}

export function createErrorResponse(
  message: string,
  options: { code?: string; details?: unknown; requestId?: string; route?: string } = {}
): ApiResponse {
  return createApiResponse.error(message, options);
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
  _message?: string
): ApiResponse<T[]> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return createApiResponse.paginated<T>(
    data,
    {
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    }
  );
}

/**
 * Middleware para tRPC que padroniza respostas
 */
export function standardizeResponse(options: {
  result: unknown;
  type: 'query' | 'mutation' | 'subscription';
  path: string;
  input: unknown;
  ctx: { requestId?: string; startTime?: number };
}) {
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
export function withStandardResponse<TInput, TOutput>(
  procedure: {
    output: (schema: unknown) => {
      use: (
        mw: (opts: {
          input: TInput;
          ctx: { requestId?: string };
          next: () => Promise<unknown>;
        }) => Promise<unknown>
      ) => unknown;
    };
  },
  handler: (opts: { input: TInput; ctx: unknown }) => Promise<TOutput>
) {
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
      } catch (error) {
        // O middleware de erro vai tratar
        throw error;
      }
    });
}

/**
 * Tipos auxiliares para respostas comuns
 */
export type SuccessResponse<T = any> = {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp: string;
    version: string;
    pagination?: Record<string, unknown>;
    performance?: Record<string, unknown>;
  };
};

export type ErrorResponse = {
  success: false;
  data: null;
  error: {
    code?: string;
    message: string;
    details?: unknown;
    requestId?: string;
    timestamp?: string;
    route?: string;
  };
  meta?: {
    requestId?: string;
    timestamp: string;
    version: string;
  };
};

export type StandardResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
