export class ValidationError extends Error {
    metadata;
    constructor(message, metadata) {
        super(message);
        this.name = 'ValidationError';
        this.metadata = metadata;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ValidationError);
        }
    }
}
export class InfrastructureError extends Error {
    metadata;
    constructor(message, metadata) {
        super(message);
        this.name = 'InfrastructureError';
        this.metadata = metadata;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, InfrastructureError);
        }
    }
}
