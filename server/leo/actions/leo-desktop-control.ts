/**
 * DESKTOP AUTOMATION MODULE (DESATIVADO — robotjs removido)
 *
 * Controle de Desktop do LEO — retornos padronizados como ActionResult.
 * Automação desativada; todas as funções retornam success: false.
 */

import type { ActionResult } from '../types.js';
import { LEO_DESKTOP_AUTOMATION } from '../../config/leo.js';
import { leoDesktopControl as desktopStub } from './leo-desktop-control-stub.js';

export interface MousePosition {
  x: number;
  y: number;
}

export interface ClickConfig {
  button?: 'left' | 'right' | 'middle';
  double?: boolean;
}

export interface KeyboardConfig {
  key?: string;
  modifiers?: string[];
}

const DESKTOP_DISABLED_MESSAGE = 'Desktop automation desativada';

/**
 * Classe para controle de desktop pelo Leo (desativada)
 */
export class LeoDesktopControl {
  private static instance: LeoDesktopControl;
  private readonly isEnabled = false;

  private constructor() {}

  public static getInstance(): LeoDesktopControl {
    if (!LeoDesktopControl.instance) {
      LeoDesktopControl.instance = new LeoDesktopControl();
    }
    return LeoDesktopControl.instance;
  }

  /**
   * Obtém instância do robotjs (stub seguro)
   */
  private async getRobot(): Promise<any> {
    // Verificar flag global antes de retornar instância
    if (LEO_DESKTOP_AUTOMATION === false) {
      console.log('[LeoDesktopControl] Desktop automation desabilitada via flag LEO_DESKTOP_AUTOMATION');
      return desktopStub;
    }
    
    return desktopStub;
  }

  async moverMouse(_x: number, _y: number): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async clicarMouse(_config?: ClickConfig): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async digitarTexto(_texto: string): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async pressionarTecla(_key: string, _modifiers?: string[]): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async scrollMouse(_direction: 'up' | 'down', _amount: number = 1): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async getMousePosition(): Promise<ActionResult & { position?: MousePosition }> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async getScreenSize(): Promise<ActionResult & { size?: { width: number; height: number } }> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async arrastarMouse(
    _fromX: number,
    _fromY: number,
    _toX: number,
    _toY: number
  ): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  isAvailable(): boolean {
    return this.isEnabled;
  }

  getAtalhosDisponiveis(): Array<{ nome: string; descricao: string; comando: string }> {
    return [];
  }

  async openApplication(_name: string): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async closeApplication(_name: string): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async focusWindow(_name: string): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async minimizeWindow(_name: string): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async maximizeWindow(_name: string): Promise<ActionResult> {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async detectarJanelasAbertas(): Promise<
    ActionResult & { janelas?: Array<{ name: string; title: string; process: string }> }
  > {
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }

  async executarAtalho(atalho: string): Promise<ActionResult> {
    if (!atalho?.trim()) {
      return { success: false, message: 'Atalho inválido' };
    }
    return { success: false, message: DESKTOP_DISABLED_MESSAGE };
  }
}

export const leoDesktopControl = LeoDesktopControl.getInstance();
