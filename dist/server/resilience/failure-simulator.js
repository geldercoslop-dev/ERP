import { createLogger } from '../infra/structured-logger.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import express from "express";
const logger = createLogger('failure-simulator');
/**
 * Simulador de Falhas Externas para Testes de Resiliência
 */
export class ExternalFailureSimulator {
    failureEnabled = false;
    failureRate = 0.1;
    currentFailureType = 'timeout';
    constructor(options = {}) {
        this.failureRate = options.failureRate || 0.1;
        this.failureEnabled = options.enabled !== false;
    }
    setFailureRate(rate) {
        this.failureRate = Math.max(0, Math.min(1, rate));
        logger.info('Failure simulator rate updated', {
            metadata: { failureRate: this.failureRate }
        });
    }
    setFailureType(type) {
        this.currentFailureType = type;
        logger.info('Failure simulator type updated', {
            metadata: { failureType: type }
        });
    }
    setEnabled(enabled) {
        this.failureEnabled = enabled;
        logger.info('Failure simulator toggled', {
            metadata: { enabled }
        });
    }
    async execute(operation, operationName = 'external_operation') {
        if (!this.failureEnabled) {
            return await operation();
        }
        if (Math.random() < this.failureRate) {
            logger.warn('Simulating external failure', {
                metadata: {
                    operation: operationName,
                    failureType: this.currentFailureType,
                    failureRate: this.failureRate
                }
            });
            return this.simulateFailure(operationName);
        }
        return await operation();
    }
    async simulateFailure(operationName) {
        switch (this.currentFailureType) {
            case 'timeout':
                await new Promise(resolve => setTimeout(resolve, 100));
                throw new InfrastructureError(`External API timeout: ${operationName}`);
            case 'network':
                throw new InfrastructureError(`Network error: ECONNRESET - ${operationName}`);
            case '500':
                const error = new Error(`Internal Server Error: ${operationName}`);
                error.status = 500;
                throw error;
            case 'rate_limit':
                const rateError = new Error(`Rate limit exceeded: ${operationName}`);
                rateError.status = 429;
                throw rateError;
            case 'circuit_open':
                throw new InfrastructureError(`Circuit breaker is open: ${operationName}`);
            default:
                throw new InfrastructureError(`Unknown failure type: ${operationName}`);
        }
    }
    getStats() {
        return {
            enabled: this.failureEnabled,
            failureRate: this.failureRate,
            failureType: this.currentFailureType
        };
    }
}
// Instância global para testes
export const externalFailureSimulator = new ExternalFailureSimulator();
/**
 * Endpoints para controle dos simuladores (apenas em desenvolvimento)
 */
export function createFailureSimulationRoutes() {
    const router = express.Router();
    router.post('/configure', (req, res) => {
        const { failureRate, failureType, enabled } = req.body;
        if (failureRate !== undefined) {
            externalFailureSimulator.setFailureRate(failureRate);
        }
        if (failureType) {
            externalFailureSimulator.setFailureType(failureType);
        }
        if (enabled !== undefined) {
            externalFailureSimulator.setEnabled(enabled);
        }
        res.json({
            success: true,
            stats: externalFailureSimulator.getStats()
        });
    });
    router.get('/stats', (req, res) => {
        res.json({
            external: externalFailureSimulator.getStats()
        });
    });
    return router;
}
export default externalFailureSimulator;
