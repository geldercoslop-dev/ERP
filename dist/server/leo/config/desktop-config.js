/**
 * Configuração de Automação Desktop (TEMPORARIAMENTE DESATIVADA)
 *
 * Esta flag controla se a automação desktop está habilitada
 * Atualmente desativada para permitir compilação do ERP
 */
export const DESKTOP_AUTOMATION_ENABLED = false;
/**
 * Verifica se a automação desktop está disponível
 */
export function isDesktopAutomationAvailable() {
    return DESKTOP_AUTOMATION_ENABLED;
}
/**
 * Wrapper para funções desktop - retorna stub se desativado
 */
export function withDesktopGuard(fn, fallback) {
    return ((...args) => {
        if (DESKTOP_AUTOMATION_ENABLED) {
            return fn(...args);
        }
        return fallback();
    });
}
