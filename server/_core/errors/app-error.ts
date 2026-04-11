// Base segura para erros da aplicação
export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  public readonly code: string;
  public readonly details?: ErrorDetails;
  constructor(code: string, message: string, details?: ErrorDetails) {
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
  constructor(message: string, details?: ErrorDetails) {
    super('VALIDATION_ERROR', message, details);
  }
}

export class InfrastructureError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super('INFRASTRUCTURE_ERROR', message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super('AUTHENTICATION_ERROR', message, details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super('AUTHORIZATION_ERROR', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super('NOT_FOUND', message, details);
  }
}
