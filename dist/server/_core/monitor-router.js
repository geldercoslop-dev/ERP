/**
 * Router para monitoramento do sistema
 *
 * Este módulo fornece endpoints para monitorar o estado do sistema.
 */
import express from 'express';
import { getMonitorStatus, clearCriticalAlerts } from './service-monitor.js';
import { getErrorStats, resetErrorStats } from './service-logger.js';
import { requireAdmin } from './requireAdmin.js';
/**
 * Cria o router de monitoramento
 * @returns O router de monitoramento
 */
export function createMonitorRouter() {
    const router = express.Router();
    // Endpoint para obter o estado do monitor
    router.get('/status', requireAdmin, (req, res) => {
        const status = getMonitorStatus();
        res.json(status);
    });
    // Endpoint para obter estatísticas de erro
    router.get('/errors', requireAdmin, (req, res) => {
        const stats = getErrorStats();
        res.json(stats);
    });
    // Endpoint para limpar alertas críticos
    router.post('/clear-alerts', requireAdmin, (req, res) => {
        clearCriticalAlerts();
        res.json({ success: true, message: 'Alertas críticos limpos com sucesso' });
    });
    // Endpoint para resetar estatísticas de erro
    router.post('/reset-stats', requireAdmin, (req, res) => {
        resetErrorStats();
        res.json({ success: true, message: 'Estatísticas de erro resetadas com sucesso' });
    });
    return router;
}
