/**
 * LEO Agent specific errors
 * Extraídos do core para isolamento semântico
 */
import { AppError } from "../../_core/errors.js";
export class LeoError extends AppError {
    constructor(message, statusCode = 500) {
        super(`LEO Agent Error: ${message}`, statusCode);
    }
}
export class LeoPermissionError extends LeoError {
    constructor(action) {
        super(`Permission denied for action: ${action}`, 403);
    }
}
export class LeoAutomationError extends LeoError {
    constructor(message) {
        super(`Automation failed: ${message}`, 500);
    }
}
export class LeoIntelligenceError extends LeoError {
    constructor(message) {
        super(`Intelligence module error: ${message}`, 500);
    }
}
