/**
 * Stub Seguro para Computer Control
 *
 * Substitui require('robotjs') por verificação de flag
 * Retorna resposta padrão desabilitada
 */
import { LEO_DESKTOP_AUTOMATION } from '../../config/leo.js';
const DESKTOP_DISABLED_MESSAGE = 'Desktop automation desativada';
/**
 * Stub seguro que substitui robotjs
 */
export class LeoComputerControlStub {
    static instance;
    constructor() { }
    static getInstance() {
        if (!LeoComputerControlStub.instance) {
            LeoComputerControlStub.instance = new LeoComputerControlStub();
        }
        return LeoComputerControlStub.instance;
    }
    /**
     * Executa script específico através do sandbox
     */
    async executarScript(scriptPath, args, usuario) {
        if (LEO_DESKTOP_AUTOMATION === false) {
            return {
                success: false,
                message: DESKTOP_DISABLED_MESSAGE,
                stdout: undefined,
                stderr: undefined,
                exitCode: 1,
                executionTime: 0
            };
        }
        return {
            success: false,
            message: DESKTOP_DISABLED_MESSAGE,
            stdout: undefined,
            stderr: undefined,
            exitCode: 1,
            executionTime: 0
        };
    }
    /**
     * Verifica se sandbox está disponível
     */
    isSandboxAvailable() {
        return false;
    }
    /**
     * Lista scripts disponíveis
     */
    getAvailableScripts() {
        return [];
    }
    /**
     * Obtém status do sandbox
     */
    async getSandboxStatus() {
        return {
            success: false,
            message: DESKTOP_DISABLED_MESSAGE
        };
    }
    /**
     * Reinicia sandbox
     */
    async restartSandbox() {
        return {
            success: false,
            message: DESKTOP_DISABLED_MESSAGE
        };
    }
}
export const leoComputerControl = LeoComputerControlStub.getInstance();
