/**
 * Core System Service
 * Operações de diagnóstico e saúde do sistema
 */
import { checkProtectedDatabaseConnection } from './system-db-check.service.js';
/**
 * Verifica conexão protegida com banco de dados
 * Endpoint protegido para diagn óstico do sistema
 */
export async function checkSystemDatabaseConnection() {
    return await checkProtectedDatabaseConnection();
}
/**
 * Status da saúde básica do sistema
 */
export function getBaseSystemHealth() {
    return {
        ok: true,
        timestamp: Date.now(),
    };
}
