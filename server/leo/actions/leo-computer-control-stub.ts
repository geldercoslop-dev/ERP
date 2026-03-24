/**
 * Stub Seguro para Computer Control
 * 
 * Substitui require('robotjs') por verificação de flag
 * Retorna resposta padrão desabilitada
 */

import { LEO_DESKTOP_AUTOMATION } from '../../config/leo';

interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

interface ScriptResult {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTime: number;
}

const DESKTOP_DISABLED_MESSAGE = 'Desktop automation desativada';

/**
 * Stub seguro que substitui robotjs
 */
export class LeoComputerControlStub {
  private static instance: LeoComputerControlStub;

  private constructor() {}

  public static getInstance(): LeoComputerControlStub {
    if (!LeoComputerControlStub.instance) {
      LeoComputerControlStub.instance = new LeoComputerControlStub();
    }
    return LeoComputerControlStub.instance;
  }

  /**
   * Executa script específico através do sandbox
   */
  async executarScript(scriptPath: string, args?: string[], usuario?: string): Promise<ScriptResult> {
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
  isSandboxAvailable(): boolean {
    return false;
  }

  /**
   * Lista scripts disponíveis
   */
  getAvailableScripts(): Array<{ nome: string; descricao: string; comando: string }> {
    return [];
  }

  /**
   * Obtém status do sandbox
   */
  async getSandboxStatus(): Promise<ActionResult> {
    return { 
      success: false, 
      message: DESKTOP_DISABLED_MESSAGE 
    };
  }

  /**
   * Reinicia sandbox
   */
  async restartSandbox(): Promise<ActionResult> {
    return { 
      success: false, 
      message: DESKTOP_DISABLED_MESSAGE 
    };
  }
}

export const leoComputerControl = LeoComputerControlStub.getInstance();
