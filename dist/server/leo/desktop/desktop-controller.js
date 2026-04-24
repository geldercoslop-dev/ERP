/**
 * Desktop Controller
 *
 * Controle principal de operações desktop
 */
import { AppController } from './app-controller.js';
import { BrowserController } from './browser-controller.js';
import { SystemController } from './system-controller.js';
import { ValidationError } from '../../_core/errors/typed-errors.js';
export class DesktopController {
    appController;
    browserController;
    systemController;
    constructor() {
        this.appController = new AppController();
        this.browserController = new BrowserController();
        this.systemController = new SystemController();
    }
    /**
     * Executa uma ação desktop
     */
    async executeAction(action) {
        const startTime = Date.now();
        try {
            let result;
            switch (action.type) {
                case 'app': {
                    const appResult = await this.appController.execute(action.action, action.parameters);
                    result = { ...appResult, executionTime: appResult.executionTime ?? Date.now() - startTime };
                    break;
                }
                case 'browser': {
                    const browserResult = await this.browserController.execute(action.action, action.parameters);
                    result = { ...browserResult, executionTime: browserResult.executionTime ?? Date.now() - startTime };
                    break;
                }
                case 'system': {
                    const systemResult = await this.systemController.execute(action.action, action.parameters);
                    result = { ...systemResult, executionTime: systemResult.executionTime ?? Date.now() - startTime };
                    break;
                }
                default:
                    throw new ValidationError(`Invalid action type: ${action.type}`);
            }
            result.executionTime = result.executionTime ?? Date.now() - startTime;
            return result;
        }
        catch (error) {
            return {
                success: false,
                message: 'Desktop action failed',
                error: error instanceof Error ? error.message : 'Unknown error',
                executionTime: Date.now() - startTime,
            };
        }
    }
    /**
     * Lista todas as ações disponíveis
     */
    listAvailableActions() {
        return {
            app: this.appController.getAvailableActions(),
            browser: this.browserController.getAvailableActions(),
            system: this.systemController.getAvailableActions(),
        };
    }
    /**
     * Verifica se uma ação é segura para execução
     */
    validateAction(action) {
        const warnings = [];
        // Validações de segurança
        if (action.type === 'system' && action.action === 'executeCommand') {
            const command = action.parameters?.command || '';
            // Comandos perigosos
            const dangerousCommands = [
                'format', 'del', 'rmdir', 'shutdown', 'reboot',
                'rm -rf', 'sudo', 'chmod 777', 'dd if='
            ];
            for (const dangerous of dangerousCommands) {
                if (command.toLowerCase().includes(dangerous)) {
                    warnings.push(`Comando potencialmente perigoso: ${dangerous}`);
                }
            }
        }
        if (action.type === 'app' && action.action === 'openApp') {
            const appName = action.parameters?.appName || '';
            // Apps que requerem atenção especial
            const restrictedApps = ['regedit', 'cmd', 'powershell', 'taskmgr'];
            if (restrictedApps.includes(appName.toLowerCase())) {
                warnings.push(`Aplicação restrita: ${appName}`);
            }
        }
        return {
            valid: warnings.length === 0,
            warnings
        };
    }
    /**
     * Abre um aplicativo
     */
    async openApp(appName, parameters) {
        return await this.executeAction({
            type: 'app',
            action: 'open',
            parameters: { appName, parameters }
        });
    }
    /**
     * Fecha um aplicativo
     */
    async closeApp(appName, force = false) {
        return await this.executeAction({
            type: 'app',
            action: 'close',
            parameters: { appName, force }
        });
    }
    /**
     * Abre o navegador
     */
    async openBrowser(url, incognito = false) {
        return await this.executeAction({
            type: 'browser',
            action: 'open',
            parameters: { url, incognito }
        });
    }
    /**
     * Navega para uma URL
     */
    async navigateUrl(url, tabId) {
        return await this.executeAction({
            type: 'browser',
            action: 'navigate',
            parameters: { url, tabId }
        });
    }
    /**
     * Lê um arquivo
     */
    async readFile(filePath, encoding = 'utf-8') {
        return await this.executeAction({
            type: 'system',
            action: 'readFile',
            parameters: { filePath, encoding }
        });
    }
    /**
     * Escreve um arquivo
     */
    async writeFile(filePath, content, append = false) {
        return await this.executeAction({
            type: 'system',
            action: 'writeFile',
            parameters: { filePath, content, append }
        });
    }
    /**
     * Executa comando no terminal
     */
    async runTerminalCommand(command, workingDirectory, timeout = 30000) {
        return await this.executeAction({
            type: 'system',
            action: 'executeCommand',
            parameters: { command, workingDirectory, timeout }
        });
    }
    /**
     * Captura screenshot
     */
    async takeScreenshot(region, windowTitle, savePath) {
        return await this.executeAction({
            type: 'system',
            action: 'takeScreenshot',
            parameters: { region, windowTitle, savePath }
        });
    }
    /**
     * Obtém status do sistema por categoria
     */
    async getSystemStatus(category) {
        return await this.executeAction({
            type: 'system',
            action: 'getSystemStatus',
            parameters: { category }
        });
    }
    /**
     * Obtém uso da CPU
     */
    async getCpuUsage() {
        return await this.executeAction({
            type: 'system',
            action: 'getCpuUsage',
            parameters: {}
        });
    }
    /**
     * Obtém uso da memória
     */
    async getMemoryUsage() {
        return await this.executeAction({
            type: 'system',
            action: 'getMemoryUsage',
            parameters: {}
        });
    }
    /**
     * Lista aplicativos em execução
     */
    async getRunningApps(filter) {
        return await this.executeAction({
            type: 'app',
            action: 'getRunningApps',
            parameters: { filter }
        });
    }
}
export const desktopController = new DesktopController();
