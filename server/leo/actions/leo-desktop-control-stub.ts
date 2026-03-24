/**
 * Stub Seguro para Desktop Control
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

interface MousePosition {
  x: number;
  y: number;
}

interface ClickConfig {
  button?: 'left' | 'right' | 'middle';
  double?: boolean;
}

interface KeyboardConfig {
  key?: string;
  modifiers?: string[];
}

const DESKTOP_DISABLED_MESSAGE = 'Desktop automation desativada';

/**
 * Stub seguro que substitui robotjs
 */
export class LeoDesktopControlStub {
  private static instance: LeoDesktopControlStub;

  private constructor() {}

  public static getInstance(): LeoDesktopControlStub {
    if (!LeoDesktopControlStub.instance) {
      LeoDesktopControlStub.instance = new LeoDesktopControlStub();
    }
    return LeoDesktopControlStub.instance;
  }

  /**
   * Verifica se automação desktop está disponível
   */
  isAvailable(): boolean {
    return false; // Sempre desabilitado
  }

  /**
   * Move mouse para posição específica
   */
  async moverMouse(x: number, y: number): Promise<ActionResult> {
    if (LEO_DESKTOP_AUTOMATION === false) {
      return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  /**
   * Clica em posição específica
   */
  async clicarMouse(config?: ClickConfig): Promise<ActionResult> {
    if (LEO_DESKTOP_AUTOMATION === false) {
      return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  /**
   * Digita texto
   */
  async digitarTexto(texto: string): Promise<ActionResult> {
    if (LEO_DESKTOP_AUTOMATION === false) {
      return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  /**
   * Pressiona tecla específica
   */
  async pressionarTecla(key: string, modifiers?: string[]): Promise<ActionResult> {
    if (LEO_DESKTOP_AUTOMATION === false) {
      return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  /**
   * Obtém posição atual do mouse
   */
  async getMousePosition(): Promise<ActionResult & { position?: MousePosition }> {
    if (LEO_DESKTOP_AUTOMATION === false) {
      return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  /**
   * Obtém tamanho da tela
   */
  async getScreenSize(): Promise<ActionResult & { size?: { width: number; height: number } }> {
    if (LEO_DESKTOP_AUTOMATION === false) {
      return { success: false, message: DESKTOP_DISABLED_MESSAGE };
    }
    
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  /**
   * Lista capacidades disponíveis
   */
  getAvailableCapabilities(): Array<{ nome: string; descricao: string; comando: string }> {
    return [];
  }
}

export const leoDesktopControl = LeoDesktopControlStub.getInstance();
