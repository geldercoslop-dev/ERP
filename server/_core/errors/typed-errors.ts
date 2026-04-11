// Tipos de erro explícitos para validação e infraestrutura
export type ErrorMetadata = Record<string, unknown>;

export class ValidationError extends Error {
  public readonly metadata?: ErrorMetadata;
  constructor(message: string, metadata?: ErrorMetadata) {
    super(message);
    this.name = 'ValidationError';
    this.metadata = metadata;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

export class InfrastructureError extends Error {
  public readonly metadata?: ErrorMetadata;
  constructor(message: string, metadata?: ErrorMetadata) {
    super(message);
    this.name = 'InfrastructureError';
    this.metadata = metadata;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InfrastructureError);
    }
  }
}
