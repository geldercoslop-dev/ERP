/**
 * DESKTOP AUTOMATION MODULE (TEMPORARILY DISABLED)
 * 
 * Stub para manter compatibilidade enquanto o módulo está desativado
 * Substitui as funcionalidades do desktop-controller.ts
 */

import type { Payload } from '../../../shared/types';

export interface DesktopAction {
  type: string;
  target: string;
  parameters?: Payload;
}

export interface DesktopResult {
  success: boolean;
  message: string;
  data?: Payload;
  executionTime: number;
}

/**
 * Stub do DesktopController - retorna mensagens de desabilitado
 */
export class DesktopController {
  async openApp(appName: string, parameters?: Payload): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async closeApp(appName: string, force?: boolean): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async openBrowser(url: string, incognito?: boolean): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async navigateUrl(url: string, tabId?: number): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async readFile(filePath: string, encoding?: string): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async writeFile(filePath: string, content: string, append?: boolean): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async runTerminalCommand(command: string, workingDirectory?: string, timeout?: number): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async takeScreenshot(region?: Payload, windowTitle?: string, savePath?: string): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async getSystemStatus(category?: string): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async getCpuUsage(): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async getMemoryUsage(): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }

  async getRunningApps(filter?: string): Promise<DesktopResult> {
    return {
      success: false,
      message: 'Desktop controller temporariamente desativado',
      data: undefined,
      executionTime: 0
    };
  }
}

export const desktopController = new DesktopController();
