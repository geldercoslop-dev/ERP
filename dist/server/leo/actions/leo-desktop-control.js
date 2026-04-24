/**
 * DESKTOP AUTOMATION MODULE (DESATIVADO — robotjs removido)
 *
 * Controle de Desktop do LEO — retornos padronizados como ActionResult.
 * Automação desativada; todas as funções retornam success: false.
 */
import { LEO_DESKTOP_AUTOMATION } from '../../config/leo.js';
import { leoDesktopControl as desktopStub } from './leo-desktop-control-stub.js';
const DESKTOP_DISABLED_MESSAGE = 'Desktop automation desativada';
/**
 * Classe para controle de desktop pelo Leo (desativada)
 */
export class LeoDesktopControl {
    static instance;
    isEnabled = false;
    constructor() { }
    static getInstance() {
        if (!LeoDesktopControl.instance) {
            LeoDesktopControl.instance = new LeoDesktopControl();
        }
        return LeoDesktopControl.instance;
    }
    /**
     * Obtém instância do robotjs (stub seguro)
     */
    async getRobot() {
        // Verificar flag global antes de retornar instância
        if (LEO_DESKTOP_AUTOMATION === false) {
            console.log('[LeoDesktopControl] Desktop automation desabilitada via flag LEO_DESKTOP_AUTOMATION');
            return desktopStub;
        }
        return desktopStub;
    }
    async moverMouse(_x, _y) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async clicarMouse(_config) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async digitarTexto(_texto) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async pressionarTecla(_key, _modifiers) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async scrollMouse(_direction, _amount = 1) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async getMousePosition() {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async getScreenSize() {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async arrastarMouse(_fromX, _fromY, _toX, _toY) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    isAvailable() {
        return this.isEnabled;
    }
    getAtalhosDisponiveis() {
        return [];
    }
    async openApplication(_name) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async closeApplication(_name) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async focusWindow(_name) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async minimizeWindow(_name) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async maximizeWindow(_name) {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async detectarJanelasAbertas() {
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    async executarAtalho(atalho) {
        if (!atalho?.trim()) {
            return { success: false, message: 'Atalho inválido' };
        }
        return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
}
export const leoDesktopControl = LeoDesktopControl.getInstance();
