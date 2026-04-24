export class AppError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = this.constructor.name;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
export class ValidationError extends AppError {
    constructor(message, details) {
        super('VALIDATION_ERROR', message, details);
    }
}
export class InfrastructureError extends AppError {
    constructor(message, details) {
        super('INFRASTRUCTURE_ERROR', message, details);
    }
}
export class AuthenticationError extends AppError {
    constructor(message, details) {
        super('AUTHENTICATION_ERROR', message, details);
    }
}
export class AuthorizationError extends AppError {
    constructor(message, details) {
        super('AUTHORIZATION_ERROR', message, details);
    }
}
export class NotFoundError extends AppError {
    constructor(message, details) {
        super('NOT_FOUND', message, details);
    }
}
