/**
 * Browser Controller
 * 
 * Controla operações do navegador
 */

import { spawn } from 'child_process';
import { ValidationError, InfrastructureError } from '../../_core/errors/typed-errors.js';

export interface BrowserAction {
  action: string;
  parameters?: Record<string, any>;
}

export interface BrowserResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
  executionTime?: number;
}

export class BrowserController {
  private browserProcesses: Map<string, any> = new Map();

  /**
   * Executa uma ação do navegador
   */
  async execute(action: string, parameters?: Record<string, any>): Promise<BrowserResult> {
    try {
      switch (action) {
        case 'openBrowser':
          return await this.openBrowser(parameters?.browser);
        case 'navigateURL':
          return await this.navigateURL(parameters?.url, parameters?.browser);
        case 'closeBrowser':
          return await this.closeBrowser(parameters?.browser);
        case 'getOpenTabs':
          return await this.getOpenTabs(parameters?.browser);
        case 'getOpenTabsCount':
          const count = await this.getOpenTabsCount(parameters?.browser);
          return {
            success: true,
            message: 'Open tabs count retrieved',
            data: { count }
          };
        default:
          throw new ValidationError(`Unknown browser action: ${action}`);
      }
    } catch (error) {
      return {
        success: false,
        message: `Browser action failed: ${action}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Abre o navegador
   */
  private async openBrowser(browser: string = 'chrome'): Promise<BrowserResult> {
    try {
      const browserCommands: Record<string, string> = {
        'chrome': 'start chrome',
        'firefox': 'start firefox',
        'edge': 'start msedge',
        'default': 'start'
      };

      const command = browserCommands[browser.toLowerCase()] || browserCommands.default;

      return new Promise((resolve) => {
        const process = spawn(command, [], {
          detached: true,
          stdio: 'ignore',
          shell: true,
        });

        process.on('spawn', () => {
          this.browserProcesses.set(browser, process);
          resolve({
            success: true,
            message: `Browser ${browser} opened successfully`,
            data: { pid: process.pid, browser }
          });
        });

        process.on('error', (error) => {
          resolve({
            success: false,
            message: `Failed to open ${browser}`,
            error: error.message
          });
        });

        setTimeout(() => {
          if (!process.killed) {
            resolve({
              success: true,
              message: `Browser ${browser} started`,
              data: { pid: process.pid, browser }
            });
          }
        }, 3000);
      });

    } catch (error) {
      throw new InfrastructureError(`Failed to open browser ${browser}: ${error}`);
    }
  }

  /**
   * Navega para uma URL
   */
  private async navigateURL(url: string, browser: string = 'chrome'): Promise<BrowserResult> {
    if (!url) {
      throw new ValidationError('URL is required');
    }

    // Validação básica de URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      const browserCommands: Record<string, string> = {
        'chrome': `start chrome "${url}"`,
        'firefox': `start firefox "${url}"`,
        'edge': `start msedge "${url}"`,
        'default': `start "${url}"`
      };

      const command = browserCommands[browser.toLowerCase()] || browserCommands.default;

      return new Promise((resolve) => {
        const process = spawn(command, [], {
          detached: true,
          stdio: 'ignore',
          shell: true,
        });

        process.on('spawn', () => {
          resolve({
            success: true,
            message: `Navigated to ${url} in ${browser}`,
            data: { url, browser }
          });
        });

        process.on('error', (error) => {
          resolve({
            success: false,
            message: `Failed to navigate to ${url}`,
            error: error.message
          });
        });

        setTimeout(() => {
          resolve({
            success: true,
            message: `Navigation initiated to ${url}`,
            data: { url, browser }
          });
        }, 2000);
      });

    } catch (error) {
      throw new InfrastructureError(`Failed to navigate to ${url}: ${error}`);
    }
  }

  /**
   * Fecha o navegador
   */
  private async closeBrowser(browser: string = 'chrome'): Promise<BrowserResult> {
    try {
      const process = this.browserProcesses.get(browser);
      if (process && !process.killed) {
        process.kill();
        this.browserProcesses.delete(browser);
        
        return {
          success: true,
          message: `Browser ${browser} closed successfully`,
        };
      }

      // Tenta fechar pelo nome do processo
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const processNames: Record<string, string> = {
        'chrome': 'chrome.exe',
        'firefox': 'firefox.exe',
        'edge': 'msedge.exe'
      };

      const processName = processNames[browser.toLowerCase()];
      if (processName) {
        await execAsync(`taskkill /f /im ${processName}`);
      }

      return {
        success: true,
        message: `Browser ${browser} closed`,
      };

    } catch (error) {
      // Se o erro for "process not found", considera sucesso
      if (error instanceof Error && error.message.includes('not found')) {
        return {
          success: true,
          message: `Browser ${browser} was not running`,
        };
      }
      
      throw new InfrastructureError(`Failed to close browser ${browser}: ${error}`);
    }
  }

  /**
   * Obtém abas abertas (simulação)
   */
  private async getOpenTabs(browser: string = 'chrome'): Promise<BrowserResult> {
    // Em uma implementação real, usaria APIs do navegador
    // Por enquanto, retorna dados simulados
    return {
      success: true,
      message: `Open tabs for ${browser}`,
      data: {
        browser,
        tabs: [
          { title: 'Google', url: 'https://google.com' },
          { title: 'GitHub', url: 'https://github.com' },
        ],
        count: 2
      }
    };
  }

  /**
   * Obtém número de abas abertas
   */
  async getOpenTabsCount(browser: string = 'chrome'): Promise<number> {
    try {
      const result = await this.getOpenTabs(browser);
      const data = result.data;
      if (data && typeof data === 'object' && 'count' in data) {
        const count = (data as { count?: unknown }).count;
        return typeof count === 'number' ? count : 0;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Lista ações disponíveis
   */
  getAvailableActions(): string[] {
    return ['openBrowser', 'navigateURL', 'closeBrowser', 'getOpenTabs', 'getOpenTabsCount'];
  }
}
