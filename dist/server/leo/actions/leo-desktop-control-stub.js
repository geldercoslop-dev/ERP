/**
 * Stub Seguro para Desktop Control
 *
 * Substitui require('robotjs') por verificação de flag
 * Retorna resposta padrão desabilitada
 */
import { LEO_DESKTOP_AUTOMATION } from '../../config/leo.js';
const DESKTOP_DISABLED_MESSAGE = 'Desktop automation desativada';
/**
 * Stub seguro que substitui robotjs
 */
export class LeoDesktopControlStub {
    static instance;
    constructor() { }
    static getInstance() {
        if (!LeoDesktopControlStub.instance) {
            LeoDesktopControlStub.instance = new LeoDesktopControlStub();
        }
        return LeoDesktopControlStub.instance;
    }
    /**
     * Verifica se automação desktop está disponível
     */
    isAvailable() {
        return false; // Sempre desabilitado
    }
    /**
     * Move mouse para posição específica
     */
    async moverMouse(x, y) {
        if (LEO_DESKTOP_AUTOMATION === false) {
            return { success: false, message: DESKTOP_DISABLED_MESSAGE };
        }
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    /**
     * Clica em posição específica
     */
    async clicarMouse(config) {
        if (LEO_DESKTOP_AUTOMATION === false) {
            return { success: false, message: DESKTOP_DISABLED_MESSAGE };
        }
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    /**
     * Digita texto
     */
    async digitarTexto(texto) {
        if (LEO_DESKTOP_AUTOMATION === false) {
            return { success: false, message: DESKTOP_DISABLED_MESSAGE };
        }
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    /**
     * Pressiona tecla específica
     */
    async pressionarTecla(key, modifiers) {
        if (LEO_DESKTOP_AUTOMATION === false) {
            return { success: false, message: DESKTOP_DISABLED_MESSAGE };
        }
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    /**
     * Obtém posição atual do mouse
     */
    async getMousePosition() {
        if (LEO_DESKTOP_AUTOMATION === false) {
            return { success: false, message: DESKTOP_DISABLED_MESSAGE };
        }
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    /**
     * Obtém tamanho da tela
     */
    async getScreenSize() {
        if (LEO_DESKTOP_AUTOMATION === false) {
            return { success: false, message: DESKTOP_DISABLED_MESSAGE };
        }
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    /**
     * Lista capacidades disponíveis
     */
    getAvailableCapabilities() {
        return [];
    }
}
export const leoDesktopControl = LeoDesktopControlStub.getInstance();
