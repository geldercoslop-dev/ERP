/**
 * Application Controller
 *
 * Controla aplicações desktop
 */
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { ValidationError, InfrastructureError } from '../../_core/errors/typed-errors.js';
const execAsync = promisify(exec);
export class AppController {
    runningProcesses = new Map();
    /**
     * Executa uma ação de aplicação
     */
    async execute(action, parameters) {
        try {
            switch (action) {
                case 'openApp':
                    return await this.openApp(parameters?.appName, parameters?.args);
                case 'closeApp':
                    return await this.closeApp(parameters?.appName);
                case 'listApps':
                    return await this.listApps();
                case 'getRunningApps':
                    const apps = await this.getRunningApps();
                    return {
                        success: true,
                        message: 'Running applications retrieved',
                        data: { apps }
                    };
                default:
                    throw new ValidationError(`Unknown app action: ${action}`);
            }
        }
        catch (error) {
            return {
                success: false,
                message: `App action failed: ${action}`,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Abre uma aplicação
     */
    async openApp(appName, args) {
        if (!appName) {
            throw new ValidationError('App name is required');
        }
        try {
            // Mapeamento de aplicações comuns para Windows
            const appMap = {
                'notepad': 'notepad.exe',
                'calculator': 'calc.exe',
                'explorer': 'explorer.exe',
                'chrome': 'chrome.exe',
                'firefox': 'firefox.exe',
                'word': 'winword.exe',
                'excel': 'excel.exe',
                'powerpoint': 'powerpnt.exe',
                'cmd': 'cmd.exe',
                'powershell': 'powershell.exe',
                'taskmgr': 'taskmgr.exe',
                'regedit': 'regedit.exe',
            };
            const executable = appMap[appName.toLowerCase()] || appName;
            return new Promise((resolve) => {
                const process = spawn(executable, args || [], {
                    detached: true,
                    stdio: 'ignore',
                    shell: true,
                });
                process.on('spawn', () => {
                    this.runningProcesses.set(appName, process);
                    resolve({
                        success: true,
                        message: `Application ${appName} opened successfully`,
                        data: { pid: process.pid, appName }
                    });
                });
                process.on('error', (error) => {
                    resolve({
                        success: false,
                        message: `Failed to open ${appName}`,
                        error: error.message
                    });
                });
                // Timeout para apps que podem não responder
                setTimeout(() => {
                    if (!process.killed) {
                        resolve({
                            success: true,
                            message: `Application ${appName} started (may be running in background)`,
                            data: { pid: process.pid, appName }
                        });
                    }
                }, 3000);
            });
        }
        catch (error) {
            throw new InfrastructureError(`Failed to open app ${appName}: ${error}`);
        }
    }
    /**
     * Fecha uma aplicação
     */
    async closeApp(appName) {
        if (!appName) {
            throw new ValidationError('App name is required');
        }
        try {
            // Tenta fechar pelo processo em execução
            const process = this.runningProcesses.get(appName);
            if (process && !process.killed) {
                process.kill();
                this.runningProcesses.delete(appName);
                return {
                    success: true,
                    message: `Application ${appName} closed successfully`,
                };
            }
            // Se não encontrou, tenta pelo taskkill
            const { stdout } = await execAsync(`taskkill /f /im ${appName}.exe`);
            return {
                success: true,
                message: `Application ${appName} terminated`,
                data: { output: stdout }
            };
        }
        catch (error) {
            // Se o erro for "process not found", considera sucesso
            if (error instanceof Error && error.message.includes('not found')) {
                return {
                    success: true,
                    message: `Application ${appName} was not running`,
                };
            }
            throw new InfrastructureError(`Failed to close app ${appName}: ${error}`);
        }
    }
    /**
     * Lista aplicações disponíveis
     */
    async listApps() {
        const commonApps = [
            { name: 'notepad', description: 'Bloco de notas' },
            { name: 'calculator', description: 'Calculadora' },
            { name: 'explorer', description: 'Windows Explorer' },
            { name: 'chrome', description: 'Google Chrome' },
            { name: 'firefox', description: 'Mozilla Firefox' },
            { name: 'word', description: 'Microsoft Word' },
            { name: 'excel', description: 'Microsoft Excel' },
            { name: 'powerpoint', description: 'Microsoft PowerPoint' },
            { name: 'cmd', description: 'Prompt de Comando' },
            { name: 'powershell', description: 'PowerShell' },
            { name: 'taskmgr', description: 'Gerenciador de Tarefas' },
        ];
        return {
            success: true,
            message: 'Available applications listed',
            data: { apps: commonApps }
        };
    }
    /**
     * Obtém aplicações em execução
     */
    async getRunningApps() {
        try {
            const { stdout } = await execAsync('tasklist /fo csv | findstr ".exe"');
            const lines = stdout.split('\n');
            const apps = [];
            for (const line of lines) {
                const match = line.match(/"([^"]+)\.exe"/);
                if (match) {
                    const appName = match[1].toLowerCase();
                    if (!apps.includes(appName)) {
                        apps.push(appName);
                    }
                }
            }
            return apps;
        }
        catch (error) {
            console.error('Error getting running apps:', error);
            return [];
        }
    }
    /**
     * Lista ações disponíveis
     */
    getAvailableActions() {
        return ['openApp', 'closeApp', 'listApps', 'getRunningApps'];
    }
}
