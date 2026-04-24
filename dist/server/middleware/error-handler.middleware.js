/**
 * Creates a custom error with status code
 */
export function createError(message, statusCode = 500, details) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = true;
    error.details = details;
    return error;
}
/**
 * Global error handler middleware
 */
export function globalErrorHandler(error, req, res, next) {
    const reqWithTenant = req;
    // Log error
    console.error('[GlobalErrorHandler] Error:', {
        message: error.message,
        url: req.url,
        method: req.method,
        body: req.body,
        user: req.user,
        tenantId: reqWithTenant.tenantId,
        timestamp: new Date().toISOString()
    });
    // Default error response
    let statusCode = error.statusCode || 500;
    let message = error.message || 'Erro interno';
    let details = error.details;
    // Handle specific error types
    if (error.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation failed';
    }
    else if (error.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized access';
    }
    else if (error.name === 'ForbiddenError') {
        statusCode = 403;
        message = 'Access forbidden';
    }
    else if (error.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Resource not found';
    }
    else if (error.name === 'ConflictError') {
        statusCode = 409;
        message = 'Resource conflict';
    }
    else if (error.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid or expired token';
    }
    else if (error.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid data format';
    }
    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production') {
        details = undefined;
    }
    if (statusCode >= 500) {
        message = 'Erro interno';
        details = undefined;
    }
    // Send error response
    res.status(statusCode).json({
        success: false,
        error: message,
        message: message,
        details: details,
        timestamp: new Date().toISOString(),
        path: req.url
    });
}
/**
 * 404 Not Found handler
 */
export function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: 'Not found',
        message: `Route ${req.method} ${req.url} not found`,
        timestamp: new Date().toISOString()
    });
}
/**
 * Async error wrapper
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
