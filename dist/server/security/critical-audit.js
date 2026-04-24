// Type guard para validar objeto
function isRecord(data) {
    return typeof data === "object" && data !== null;
}
function isAuditData(data) {
    return (typeof data === "object" &&
        data !== null &&
        "action" in data);
}
import { createLogger } from '../infra/structured-logger.js';
import { insertAuditLog } from '../services/audit-service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
const logger = createLogger('security-audit');
// Type guards
function isResponseData(data) {
    return isRecord(data);
}
function isSanitizedData(data) {
    return isRecord(data);
}
/**
 * Middleware de auditoria crítica
 * Loga operações sensíveis do sistema
 */
export function criticalAuditMiddleware() {
    return (req, res, next) => {
        // Intercepta res.json para auditoria
        const originalJson = res.json.bind(res);
        res.json = ((body) => {
            // Auditoria de operações críticas
            if (isRecord(body)) {
                auditCriticalOperation(req, res, body);
            }
            return originalJson(body);
        });
        next();
    };
}
/**
 * Função para auditar operações críticas
 */
async function auditCriticalOperation(req, res, responseData) {
    try {
        const path = req.path;
        const method = req.method;
        const tenantId = req.tenantId;
        const userId = req.user?.userId;
        const vendedorId = req.vendedor?.id;
        // Operações críticas para auditoria
        const criticalOperations = [
            { path: '/auth/login', action: 'LOGIN_ATTEMPT' },
            { path: '/auth/logout', action: 'LOGOUT' },
            { path: '/pedidos', method: 'POST', action: 'PEDIDO_CREATED' },
            { path: '/financeiro/contas-pagar', method: 'POST', action: 'CONTAS_PAGAR_CREATED' },
            { path: '/financeiro/contas-pagar', method: 'PUT', action: 'CONTAS_PAGAR_UPDATED' },
            { path: '/financeiro/contas-receber', method: 'POST', action: 'CONTAS_RECEBER_CREATED' },
            { path: '/financeiro/contas-receber', method: 'PUT', action: 'CONTAS_RECEBER_UPDATED' },
            { path: '/usuarios', method: 'POST', action: 'USER_CREATED' },
            { path: '/usuarios', method: 'PUT', action: 'USER_UPDATED' },
            { path: '/usuarios', method: 'DELETE', action: 'USER_DELETED' },
            { path: '/clientes', method: 'POST', action: 'CLIENTE_CREATED' },
            { path: '/clientes', method: 'PUT', action: 'CLIENTE_UPDATED' },
            { path: '/clientes', method: 'DELETE', action: 'CLIENTE_DELETED' },
        ];
        // Verifica se é uma operação crítica
        const criticalOp = criticalOperations.find(op => {
            const pathMatch = path.includes(op.path);
            const methodMatch = op.method ? method === op.method : true;
            return pathMatch && methodMatch;
        });
        if (!criticalOp || !tenantId) {
            return;
        }
        // Prepara dados para auditoria
        const auditDataRaw = {
            tenantId,
            action: criticalOp.action,
            entity: criticalOp.path.split('/')[1] || 'UNKNOWN',
            entityId: String(extractEntityId(responseData, req) || ''),
            actorUserId: userId,
            actorVendedorId: vendedorId,
            metadata: {
                path,
                method,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                statusCode: res.statusCode,
                success: res.statusCode < 400,
                requestData: sanitizeRequestData(req.body),
                responseData: sanitizeResponseData(responseData),
                timestamp: new Date().toISOString(),
            },
        };
        if (!isAuditData(auditDataRaw)) {
            throw new ValidationError('Audit inválido');
        }
        // Registra auditoria
        await insertAuditLog(auditDataRaw);
        // Log adicional para operações de alto risco
        if (['LOGIN_ATTEMPT', 'USER_CREATED', 'USER_DELETED', 'CLIENTE_DELETED'].includes(criticalOp.action)) {
            logger.warn(`Critical operation: ${criticalOp.action}`, {
                metadata: {
                    tenantId,
                    userId,
                    vendedorId,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path,
                    method,
                    statusCode: res.statusCode,
                    success: res.statusCode < 400,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    catch (error) {
        logger.error('Error in critical audit', error, {
            metadata: {
                path: req.path,
                method: req.method,
                tenantId: req.tenantId,
            },
        });
    }
}
/**
 * Extrai ID da entidade da resposta
 */
function extractEntityId(responseData, req) {
    if (!responseData || typeof responseData !== 'object') {
        return undefined;
    }
    // Para operações de criação, geralmente retorna { id: X, ... }
    if (responseData.id && typeof responseData.id === 'number') {
        return responseData.id;
    }
    // Para operações que retornam arrays
    if (Array.isArray(responseData) && responseData.length > 0) {
        const firstItem = responseData[0];
        if (firstItem && typeof firstItem.id === 'number') {
            return firstItem.id;
        }
    }
    // Para respostas com data
    if (responseData.data && responseData.data.id) {
        return responseData.data.id;
    }
    // Para respostas de pedidos
    if (responseData.numero && typeof responseData.numero === 'number') {
        return responseData.numero;
    }
    return undefined;
}
/**
 * Sanitiza dados do request para auditoria
 */
function sanitizeRequestData(body) {
    if (!isRecord(body)) {
        if (isSanitizedData(body)) {
            return body;
        }
        return {};
    }
    const sanitized = { ...body };
    // Remove dados sensíveis
    delete sanitized.password;
    delete sanitized.senha;
    delete sanitized.token;
    delete sanitized.secret;
    delete sanitized.hash;
    // Trunca dados grandes
    for (const [key, value] of Object.entries(sanitized)) {
        if (typeof value === 'string' && value.length > 500) {
            sanitized[key] = value.substring(0, 500) + '... (truncated)';
        }
        else if (Array.isArray(value) && value.length > 10) {
            sanitized[key] = value.slice(0, 10);
        }
    }
    return sanitized;
}
/**
 * Sanitiza dados da resposta para auditoria
 */
function sanitizeResponseData(data) {
    if (!isRecord(data)) {
        if (isSanitizedData(data)) {
            return data;
        }
        return {};
    }
    const sanitized = { ...data };
    // Remove dados sensíveis da resposta
    delete sanitized.token;
    delete sanitized.session;
    delete sanitized.secret;
    return sanitized;
}
/**
 * Middleware específico para auditoria de login
 */
export function loginAuditMiddleware() {
    return async (req, res, next) => {
        if (!req.path.includes('/login') && !req.path.includes('/auth')) {
            return next();
        }
        const originalJson = res.json.bind(res);
        res.json = ((body) => {
            // Auditoria de tentativa de login
            if (isResponseData(body)) {
                auditLoginAttempt(req, res, body).catch(error => {
                    console.error('Error auditing login attempt:', error);
                });
            }
            return originalJson(body);
        });
        next();
    };
}
/**
 * Auditoria específica para tentativas de login
 */
async function auditLoginAttempt(req, res, responseData) {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            return;
        }
        const success = res.statusCode === 200 && responseData.success;
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';
        const email = req.body?.email || req.body?.login || 'unknown';
        await insertAuditLog({
            tenantId,
            action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
            entity: 'AUTH',
            entityId: undefined,
            actorUserId: responseData.user?.id,
            actorVendedorId: responseData.vendedor?.id,
            metadata: {
                ip,
                userAgent,
                email,
                success,
                path: req.path,
                method: req.method,
                timestamp: new Date().toISOString(),
            },
        });
        // Log para tentativas falhadas
        if (!success) {
            logger.warn('Login failed', {
                metadata: {
                    tenantId,
                    ip,
                    userAgent,
                    email,
                    path: req.path,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    catch (error) {
        logger.error('Error in login audit', error);
    }
}
/**
 * Middleware para auditoria de operações financeiras
 */
export function financialAuditMiddleware() {
    return (req, res, next) => {
        const isFinancialPath = req.path.includes('/financeiro') ||
            req.path.includes('/contas-pagar') ||
            req.path.includes('/contas-receber') ||
            req.path.includes('/comissoes');
        if (!isFinancialPath) {
            return next();
        }
        const originalJson = res.json.bind(res);
        res.json = ((body) => {
            // Auditoria de operações financeiras
            if (isResponseData(body)) {
                auditFinancialOperation(req, res, body).catch(error => {
                    console.error('Error auditing financial operation:', error);
                });
            }
            return originalJson(body);
        });
        next();
    };
}
/**
 * Auditoria específica para operações financeiras
 */
async function auditFinancialOperation(req, res, responseData) {
    try {
        const tenantId = req.tenantId;
        const userId = req.user?.userId;
        const vendedorId = req.vendedor?.id;
        if (!tenantId) {
            return;
        }
        const action = getFinancialAction(req.path, req.method);
        if (!action) {
            return;
        }
        await insertAuditLog({
            tenantId,
            action,
            entity: 'FINANCIAL',
            entityId: String(extractEntityId(responseData, req) || ''),
            actorUserId: userId,
            actorVendedorId: vendedorId,
            metadata: {
                path: req.path,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                statusCode: res.statusCode,
                success: res.statusCode < 400,
                requestData: sanitizeRequestData(req.body),
                responseData: sanitizeResponseData(responseData),
                timestamp: new Date().toISOString(),
            },
        });
        // Log para operações de alto valor
        const valor = extractValor(responseData);
        if (valor && valor > 1000) {
            logger.warn('High value financial operation', {
                metadata: {
                    tenantId,
                    userId,
                    vendedorId,
                    action,
                    valor,
                    path: req.path,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    catch (error) {
        logger.error('Error in financial audit', error);
    }
}
/**
 * Obtém ação financeira baseada no path e método
 */
function getFinancialAction(path, method) {
    if (path.includes('/contas-pagar')) {
        if (method === 'POST')
            return 'CONTAS_PAGAR_CREATED';
        if (method === 'PUT')
            return 'CONTAS_PAGAR_UPDATED';
        if (method === 'DELETE')
            return 'CONTAS_PAGAR_DELETED';
    }
    if (path.includes('/contas-receber')) {
        if (method === 'POST')
            return 'CONTAS_RECEBER_CREATED';
        if (method === 'PUT')
            return 'CONTAS_RECEBER_UPDATED';
        if (method === 'DELETE')
            return 'CONTAS_RECEBER_DELETED';
    }
    if (path.includes('/comissoes')) {
        if (method === 'POST')
            return 'COMISSAO_CREATED';
        if (method === 'PUT')
            return 'COMISSAO_UPDATED';
    }
    return undefined;
}
/**
 * Extrai valor monetário da resposta
 */
function extractValor(data) {
    if (!data || typeof data !== 'object') {
        return undefined;
    }
    // Verifica campos comuns de valor
    if (data.valor && typeof data.valor === 'string') {
        return parseFloat(data.valor.replace(/[^\d.,]/g, ''));
    }
    if (data.total && typeof data.total === 'string') {
        return parseFloat(data.total.replace(/[^\d.,]/g, ''));
    }
    if (data.valor && typeof data.valor === 'number') {
        return data.valor;
    }
    if (data.total && typeof data.total === 'number') {
        return data.total;
    }
    return undefined;
}
