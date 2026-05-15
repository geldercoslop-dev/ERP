import { describe, it, expect, beforeEach } from 'vitest';
import { ERPError, ErrorCode, createError, globalErrorHandler } from '../../_core/error-handler.js';
import { createApiResponse } from '../../_core/api-response.js';
import { auditor } from '../../_core/endpoint-auditor.js';

describe('Global Error Handler', () => {
  beforeEach(() => {
    // Mock tenant ID
    process.env.TEST_TENANT_ID = '99';
    process.env.DEFAULT_TENANT_ID = '99';
  });

  it('should handle ERPError correctly', async () => {
    const mockCtx = {
      requestId: 'test-123',
      user: { id: 1, role: 'admin' },
      tenantId: 99,
      startTime: Date.now(),
      req: {
        headers: { 'user-agent': 'test-agent' },
        ip: '127.0.0.1'
      }
    };

    const erpError = new ERPError(
      ErrorCode.VALIDATION_ERROR,
      'Test validation error',
      400,
      { field: 'test' },
      'test-123',
      'test.endpoint'
    );

    let errorCaught = false;
    try {
      await globalErrorHandler({
        error: erpError,
        type: 'query',
        path: 'test.endpoint',
        input: { test: true },
        ctx: mockCtx,
        next: () => {}
      });
    } catch (error) {
      errorCaught = true;
      expect(error).toBeInstanceOf(ERPError);
    }
    expect(errorCaught).toBe(true);
  });

  it('should convert generic error to ERPError', async () => {
    const mockCtx = {
      requestId: 'test-123',
      user: { id: 1, role: 'admin' },
      tenantId: 99,
      startTime: Date.now(),
      req: {
        headers: { 'user-agent': 'test-agent' },
        ip: '127.0.0.1'
      }
    };

    const genericError = new Error('Test generic error');

    let errorCaught = false;
    try {
      await globalErrorHandler({
        error: genericError,
        type: 'mutation',
        path: 'test.mutation',
        input: { data: 'test' },
        ctx: mockCtx,
        next: () => {}
      });
    } catch (error) {
      errorCaught = true;
      expect(error).toBeInstanceOf(ERPError);
      if (error instanceof ERPError) {
        expect(error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      }
    }
    expect(errorCaught).toBe(true);
  });
});

describe('API Responses', () => {
  it('should create success response with correct structure', () => {
    const successResponse = createApiResponse.success(
      { id: 1, name: 'Test' },
      { requestId: 'test-123' }
    );

    expect(successResponse.success).toBe(true);
    expect(successResponse.data).toEqual({ id: 1, name: 'Test' });
    expect(successResponse.meta?.requestId).toBe('test-123');
  });

  it('should create error response with correct structure', () => {
    const errorResponse = createApiResponse.error(
      'Test error message',
      { code: 'TEST_ERROR', requestId: 'test-456' }
    );

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error?.code).toBe('TEST_ERROR');
  });

  it('should create paginated response with correct structure', () => {
    const paginatedResponse = createApiResponse.paginated(
      [{ id: 1 }, { id: 2 }],
      { page: 1, pageSize: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      { requestId: 'test-789' }
    );

    expect(paginatedResponse.success).toBe(true);
    expect(paginatedResponse.meta?.pagination).toBeDefined();
    expect(paginatedResponse.meta?.pagination?.total).toBe(2);
  });

  it('should create validation response with correct structure', () => {
    const validationResponse = createApiResponse.validation([
      { field: 'email', message: 'Invalid email' },
      { field: 'password', message: 'Password too short' }
    ]);

    expect(validationResponse.success).toBe(false);
    expect(validationResponse.error?.details).toHaveLength(2);
  });
});

describe('Custom Errors', () => {
  it('should create validation error with correct properties', () => {
    const validationError = createError.validation('Invalid input', { field: 'test' });

    expect(validationError).toBeInstanceOf(ERPError);
    expect(validationError.code).toBeDefined();
    expect(validationError.message).toBe('Invalid input');
    expect(validationError.statusCode).toBeGreaterThanOrEqual(400);
    expect(validationError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should create unauthorized error with correct properties', () => {
    const unauthorizedError = createError.unauthorized('Access denied', 'req-123');

    expect(unauthorizedError).toBeInstanceOf(ERPError);
    expect(unauthorizedError.code).toBeDefined();
    expect(unauthorizedError.message).toBe('Access denied');
    expect(unauthorizedError.statusCode).toBeGreaterThanOrEqual(400);
    expect(unauthorizedError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should create not found error with correct properties', () => {
    const notFoundError = createError.notFound('User', 123, 'req-456');

    expect(notFoundError).toBeInstanceOf(ERPError);
    expect(notFoundError.code).toBeDefined();
    expect(notFoundError.statusCode).toBeGreaterThanOrEqual(400);
    expect(notFoundError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should create database error with correct properties', () => {
    const databaseError = createError.database('Connection failed');

    expect(databaseError).toBeInstanceOf(ERPError);
    expect(databaseError.code).toBeDefined();
    expect(databaseError.statusCode).toBeGreaterThanOrEqual(400);
    expect(databaseError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should create business error with correct properties', () => {
    const businessError = createError.business('Business rule violation');

    expect(businessError).toBeInstanceOf(ERPError);
    expect(businessError.code).toBeDefined();
    expect(businessError.statusCode).toBeGreaterThanOrEqual(400);
    expect(businessError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should create stock error with correct properties', () => {
    const stockError = createError.stock('Insufficient stock', 456);

    expect(stockError).toBeInstanceOf(ERPError);
    expect(stockError.code).toBeDefined();
    expect(stockError.statusCode).toBeGreaterThanOrEqual(400);
    expect(stockError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should create external error with correct properties', () => {
    const externalError = createError.external('payment', 'Payment failed');

    expect(externalError).toBeInstanceOf(ERPError);
    expect(externalError.code).toBeDefined();
    expect(externalError.statusCode).toBeGreaterThanOrEqual(400);
    expect(externalError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should create timeout error with correct properties', () => {
    const timeoutError = createError.timeout('query', 5000);

    expect(timeoutError).toBeInstanceOf(ERPError);
    expect(timeoutError.code).toBeDefined();
    expect(timeoutError.statusCode).toBeGreaterThanOrEqual(400);
    expect(timeoutError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should create rate limit error with correct properties', () => {
    const rateLimitError = createError.rateLimit(100, '1m');

    expect(rateLimitError).toBeInstanceOf(ERPError);
    expect(rateLimitError.code).toBeDefined();
    expect(rateLimitError.statusCode).toBeGreaterThanOrEqual(400);
    expect(rateLimitError.statusCode).toBeLessThanOrEqual(599);
  });

  it('should convert error to API response', () => {
    const error = createError.validation('Invalid input', { field: 'test' });
    const apiResponse = error.toApiResponse();

    expect(apiResponse.success).toBe(false);
    expect(apiResponse.error).toBeDefined();
  });
});

describe('Request Middleware', () => {
  beforeEach(() => {
    process.env.TEST_TENANT_ID = '99';
    process.env.DEFAULT_TENANT_ID = '99';
  });

  it('should add request ID to context', async () => {
    const mockCtx = {
      req: {
        headers: { 'user-agent': 'test-agent' },
        method: 'POST',
        url: '/api/test',
        ip: '127.0.0.1'
      },
      user: { id: 1, role: 'admin' },
      tenantId: 99,
      requestId: undefined as string | undefined,
      startTime: undefined as number | undefined
    };

    const { addRequestId } = await import('../../_core/request-middleware.js');
    const middleware = addRequestId();

    const result = await middleware({
      ctx: mockCtx,
      next: async () => ({ success: true })
    });
    
    expect(result).toBeDefined();
    expect(mockCtx.requestId).toBeDefined();
    expect(typeof mockCtx.requestId).toBe('string');
    expect(mockCtx.startTime).toBeDefined();
    expect(typeof mockCtx.startTime).toBe('number');
  });
});

describe('Endpoint Auditor', () => {
  beforeEach(() => {
    process.env.TEST_TENANT_ID = '99';
    process.env.DEFAULT_TENANT_ID = '99';
  });

  it('should identify critical endpoints correctly', () => {
    const isCritical = auditor.isCritical('auth.login');
    expect(isCritical).toBe(true);
  });

  it('should identify non-critical endpoints correctly', () => {
    const nonCritical = auditor.isCritical('health.ping');
    expect(nonCritical).toBe(false);
  });

  it('should get audit config for critical endpoint', () => {
    const authConfig = auditor.getAuditConfig('auth.login');
    expect(authConfig).toBeDefined();
    expect(authConfig?.critical).toBe(true);
  });

  it('should validate critical endpoints coverage', () => {
    const coverage = auditor.validateCriticalEndpointsCoverage([
      'auth.login',
      'clientes.create',
      'pedidos.create',
      'financeiro.pagamentos.create'
    ]);

    expect(coverage).toBeDefined();
    expect(coverage.allCovered).toBeDefined();
  });

  it('should log endpoint access', () => {
    const mockCtx = {
      requestId: 'test-123',
      user: { id: 1, role: 'admin' },
      tenantId: 99,
      req: {
        headers: { 'user-agent': 'test-agent' },
        ip: '127.0.0.1'
      }
    };

    expect(() => {
      auditor.logAccess({
        endpoint: 'auth.login',
        type: 'mutation',
        input: { username: 'test' },
        ctx: mockCtx,
        result: { success: true, token: 'abc123' }
      });
    }).not.toThrow();
  });
});
