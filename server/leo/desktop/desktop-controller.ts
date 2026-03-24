/**
 * Desktop Controller
 * 
 * Controle principal de operações desktop
 */

import { AppController } from './app-controller';
import { BrowserController } from './browser-controller';
import { SystemController } from './system-controller';

export interface DesktopAction {
  type: 'app' | 'browser' | 'system' | 'file';
  action: string;
  parameters?: Record<string, any>;
}

export interface DesktopResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
  executionTime: number;
}

export class DesktopController {
  private appController: AppController;
  private browserController: BrowserController;
  private systemController: SystemController;

  constructor() {
    this.appController = new AppController();
    this.browserController = new BrowserController();
    this.systemController = new SystemController();
  }

  /**
   * Executa uma ação desktop
   */
  async executeAction(action: DesktopAction): Promise<DesktopResult> {
    const startTime = Date.now();

    try {
      let result: DesktopResult;

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
          throw new Error(`Invalid action type: ${action.type}`);
      }

      result.executionTime = result.executionTime ?? Date.now() - startTime;
      return result;

    } catch (error) {
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
  listAvailableActions(): {
    app: string[];
    browser: string[];
    system: string[];
  } {
    return {
      app: this.appController.getAvailableActions(),
      browser: this.browserController.getAvailableActions(),
      system: this.systemController.getAvailableActions(),
    };
  }

  /**
   * Verifica se uma ação é segura para execução
   */
  validateAction(action: DesktopAction): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

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
  async openApp(appName: string, parameters?: Record<string, any>): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'app',
      action: 'open',
      parameters: { appName, parameters }
    });
  }

  /**
   * Fecha um aplicativo
   */
  async closeApp(appName: string, force: boolean = false): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'app',
      action: 'close',
      parameters: { appName, force }
    });
  }

  /**
   * Abre o navegador
   */
  async openBrowser(url: string, incognito: boolean = false): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'browser',
      action: 'open',
      parameters: { url, incognito }
    });
  }

  /**
   * Navega para uma URL
   */
  async navigateUrl(url: string, tabId?: number): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'browser',
      action: 'navigate',
      parameters: { url, tabId }
    });
  }

  /**
   * Lê um arquivo
   */
  async readFile(filePath: string, encoding: string = 'utf-8'): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'system',
      action: 'readFile',
      parameters: { filePath, encoding }
    });
  }

  /**
   * Escreve um arquivo
   */
  async writeFile(filePath: string, content: string, append: boolean = false): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'system',
      action: 'writeFile',
      parameters: { filePath, content, append }
    });
  }

  /**
   * Executa comando no terminal
   */
  async runTerminalCommand(command: string, workingDirectory?: string, timeout: number = 30000): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'system',
      action: 'executeCommand',
      parameters: { command, workingDirectory, timeout }
    });
  }

  /**
   * Captura screenshot
   */
  async takeScreenshot(region?: string, windowTitle?: string, savePath?: string): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'system',
      action: 'takeScreenshot',
      parameters: { region, windowTitle, savePath }
    });
  }

  /**
   * Obtém status do sistema por categoria
   */
  async getSystemStatus(category: string): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'system',
      action: 'getSystemStatus',
      parameters: { category }
    });
  }

  /**
   * Obtém uso da CPU
   */
  async getCpuUsage(): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'system',
      action: 'getCpuUsage',
      parameters: {}
    });
  }

  /**
   * Obtém uso da memória
   */
  async getMemoryUsage(): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'system',
      action: 'getMemoryUsage',
      parameters: {}
    });
  }

  /**
   * Lista aplicativos em execução
   */
  async getRunningApps(filter?: string): Promise<DesktopResult> {
    return await this.executeAction({
      type: 'app',
      action: 'getRunningApps',
      parameters: { filter }
    });
  }
}

export const desktopController = new DesktopController();
