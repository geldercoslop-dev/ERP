/**
 * Inicialização do Monitoramento Avançado
 */
import { AdvancedMonitoring } from './advanced-monitoring.js';
import { logInfo } from '../_core/logger.js';
async function startMonitoring() {
    logInfo('Iniciando sistema de monitoramento avançado');
    const monitoring = AdvancedMonitoring.getInstance();
    // Iniciar monitoramento com intervalo de 30 segundos
    await monitoring.startMonitoring(30000);
    logInfo('Monitoramento avançado iniciado com sucesso');
    // Manter processo ativo
    process.on('SIGINT', () => {
        logInfo('Parando monitoramento...');
        monitoring.stopMonitoring();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        logInfo('Parando monitoramento...');
        monitoring.stopMonitoring();
        process.exit(0);
    });
}
// Iniciar se executado diretamente
if (require.main === module) {
    startMonitoring().catch(error => {
        console.error('Erro ao iniciar monitoramento:', error);
        process.exit(1);
    });
}
export { startMonitoring };
