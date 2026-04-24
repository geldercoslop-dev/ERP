import { TRPCError } from '@trpc/server';
import { logError } from './logger.js';
/**
 * Tipos de erro customizados para o ERP
 */
export var ErrorCode;
(function (ErrorCode) {
    // Erros de validação
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["INVALID_INPUT"] = "INVALID_INPUT";
    ErrorCode["MISSING_REQUIRED_FIELD"] = "MISSING_REQUIRED_FIELD";
    // Erros de autenticação/autorização
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ErrorCode["INVALID_CREDENTIALS"] = "INVALID_CREDENTIALS";
    ErrorCode["SESSION_EXPIRED"] = "SESSION_EXPIRED";
    // Erros de banco de dados
    ErrorCode["DATABASE_ERROR"] = "DATABASE_ERROR";
    ErrorCode["DATABASE_CONNECTION_FAILED"] = "DATABASE_CONNECTION_FAILED";
    ErrorCode["DUPLICATE_ENTRY"] = "DUPLICATE_ENTRY";
    ErrorCode["RECORD_NOT_FOUND"] = "RECORD_NOT_FOUND";
    // Erros de negócio
    ErrorCode["BUSINESS_RULE_VIOLATION"] = "BUSINESS_RULE_VIOLATION";
    ErrorCode["INSUFFICIENT_STOCK"] = "INSUFFICIENT_STOCK";
    ErrorCode["INVALID_STATUS"] = "INVALID_STATUS";
    // Erros de sistema
    ErrorCode["INTERNAL_SERVER_ERROR"] = "INTERNAL_SERVER_ERROR";
    ErrorCode["SERVICE_UNAVAILABLE"] = "SERVICE_UNAVAILABLE";
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ErrorCode["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
    // Erros de integração
    ErrorCode["EXTERNAL_API_ERROR"] = "EXTERNAL_API_ERROR";
    ErrorCode["PAYMENT_ERROR"] = "PAYMENT_ERROR";
    ErrorCode["NOTIFICATION_ERROR"] = "NOTIFICATION_ERROR";
})(ErrorCode || (ErrorCode = {}));
/**
 * Classe de erro customizado para o ERP
 */
export class ERPError extends Error {
    code;
    statusCode;
    details;
    requestId;
    timestamp;
    route;
    constructor(code, message, statusCode = 500, details, requestId, route) {
        super(message);
        this.name = 'ERPError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.requestId = requestId;
        this.timestamp = new Date();
        this.route = route;
        // Mantém o stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ERPError);
        }
    }
    /**
     * Converte para formato de resposta da API
     */
    toApiResponse() {
        return {
            success: false,
            data: null,
            error: {
                code: this.code,
                message: this.message,
                details: this.details,
                requestId: this.requestId,
                timestamp: this.timestamp.toISOString(),
                route: this.route
            }
        };
    }
}
/**
 * Função para criar erros específicos
 */
export const createError = {
    validation: (message, details, requestId) => new ERPError(ErrorCode.VALIDATION_ERROR, message, 400, details, requestId),
    unauthorized: (message = 'Não autorizado', requestId) => new ERPError(ErrorCode.UNAUTHORIZED, message, 401, undefined, requestId),
    forbidden: (message = 'Acesso negado', requestId) => new ERPError(ErrorCode.FORBIDDEN, message, 403, undefined, requestId),
    notFound: (resource, id, requestId) => new ERPError(ErrorCode.RECORD_NOT_FOUND, `${resource}${id ? ` com ID ${id}` : ''} não encontrado`, 404, { resource, id }, requestId),
    database: (message, details, requestId) => new ERPError(ErrorCode.DATABASE_ERROR, message, 500, details, requestId),
    business: (message, details, requestId) => new ERPError(ErrorCode.BUSINESS_RULE_VIOLATION, message, 422, details, requestId),
    stock: (message, productId, requestId) => new ERPError(ErrorCode.INSUFFICIENT_STOCK, message, 422, { productId }, requestId),
    external: (service, message, details, requestId) => new ERPError(ErrorCode.EXTERNAL_API_ERROR, `Erro no serviço ${service}: ${message}`, 502, details, requestId),
    timeout: (operation, timeout, requestId) => new ERPError(ErrorCode.TIMEOUT_ERROR, `Timeout na operação ${operation} (${timeout}ms)`, 408, { operation, timeout }, requestId),
    rateLimit: (limit, window, requestId) => new ERPError(ErrorCode.RATE_LIMIT_EXCEEDED, `Limite de requisições excedido: ${limit} por ${window}`, 429, { limit, window }, requestId)
};
/**
 * Middleware global de tratamento de erros para tRPC
 */
export function globalErrorHandler(options) {
    const { error, path, ctx } = options;
    const requestId = ctx.requestId || 'unknown';
    const startTime = ctx.startTime || Date.now();
    const duration = Date.now() - startTime;
    // Log do erro completo
    logError('global-error-handler', error, {
        requestId,
        path,
        type: options.type,
        duration,
        errorMessage: error.message
    });
    // Se já for um ERPError, retornar diretamente
    if (error instanceof ERPError) {
        error.requestId = requestId;
        error.route = path;
        throw error;
    }
    // Se for TRPCError, converter para ERPError
    if (error instanceof TRPCError) {
        let code = ErrorCode.INTERNAL_SERVER_ERROR;
        let statusCode = 500;
        switch (error.code) {
            case 'BAD_REQUEST':
                code = ErrorCode.VALIDATION_ERROR;
                statusCode = 400;
                break;
            case 'UNAUTHORIZED':
                code = ErrorCode.UNAUTHORIZED;
                statusCode = 401;
                break;
            case 'FORBIDDEN':
                code = ErrorCode.FORBIDDEN;
                statusCode = 403;
                break;
            case 'NOT_FOUND':
                code = ErrorCode.RECORD_NOT_FOUND;
                statusCode = 404;
                break;
            case 'INTERNAL_SERVER_ERROR':
                code = ErrorCode.INTERNAL_SERVER_ERROR;
                statusCode = 500;
                break;
            case 'TIMEOUT':
                code = ErrorCode.TIMEOUT_ERROR;
                statusCode = 408;
                break;
            case 'CONFLICT':
                code = ErrorCode.DUPLICATE_ENTRY;
                statusCode = 409;
                break;
            case 'TOO_MANY_REQUESTS':
                code = ErrorCode.RATE_LIMIT_EXCEEDED;
                statusCode = 429;
                break;
            case 'SERVICE_UNAVAILABLE':
                code = ErrorCode.SERVICE_UNAVAILABLE;
                statusCode = 503;
                break;
        }
        const erpError = new ERPError(code, error.message, statusCode, {
            originalCode: error.code,
            originalMessage: error.message
        }, requestId, path);
        throw erpError;
    }
    // Para outros erros, criar ERPError genérico
    const erpError = new ERPError(ErrorCode.INTERNAL_SERVER_ERROR, process.env.NODE_ENV === 'production'
        ? 'Erro interno'
        : error.message || 'Erro desconhecido', 500, {
        originalError: error.name,
        originalMessage: error.message
    }, requestId, path);
    throw erpError;
}
/**
 * Middleware para Express (se necessário)
 */
export function expressErrorHandler(error, req, res, next) {
    const requestId = req.requestId || 'unknown';
    const startTime = req.startTime || Date.now();
    const duration = Date.now() - startTime;
    // Log do erro
    const userId = req.user?.id;
    logError('express-error-handler', error, {
        requestId,
        method: req.method,
        url: req.url,
        duration,
        userId,
        userAgent: req.headers?.['user-agent'],
        ip: req.ip,
        errorMessage: error.message
    });
    // Converter para ERPError se necessário
    let erpError;
    if (error instanceof ERPError) {
        erpError = error;
        erpError.requestId = requestId;
    }
    else {
        erpError = new ERPError(ErrorCode.INTERNAL_SERVER_ERROR, process.env.NODE_ENV === 'production'
            ? 'Erro interno'
            : error.message || 'Erro desconhecido', 500, {
            originalError: error.name
        }, requestId, req.route?.path);
    }
    // Enviar resposta padronizada
    res.status(erpError.statusCode).json(erpError.toApiResponse());
}
/**
 * Função auxiliar para wrapping de procedures com tratamento de erro
 */
export function withErrorHandling(procedure, handler) {
    return procedure.use(async ({ input, ctx, next }) => {
        try {
            const result = await handler({ input, ctx });
            return result;
        }
        catch (error) {
            // O middleware global vai tratar o erro
            throw error;
        }
    });
}
/**
 * Validador de erro para debugging
 */
export function debugError(error) {
    const isERPError = error instanceof ERPError;
    const isTRPCError = error instanceof TRPCError;
    let suggestedAction = 'Verificar o stack trace para mais detalhes';
    if (isERPError) {
        suggestedAction = `Verificar o código de erro: ${error.code}`;
    }
    else if (isTRPCError) {
        suggestedAction = `Verificar o código tRPC: ${error.code}`;
    }
    else if (error.name === 'ValidationError') {
        suggestedAction = 'Verificar dados de entrada';
    }
    else if (error.name === 'DatabaseError') {
        suggestedAction = 'Verificar conexão com banco de dados';
    }
    return {
        isERPError,
        isTRPCError,
        errorInfo: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        suggestedAction
    };
}
