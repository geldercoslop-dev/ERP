/**
 * Desktop Automation Plugin
 * 
 * Plugin controlado para automação desktop do LEO
 * Pode ser habilitado/desabilitado sem afetar o core
 */

import { logInfo, logError } from "../../_core/logger.js";
import type { DesktopAutomationConfig } from "../actions/desktop-automation-config.js";
import { DEFAULT_DESKTOP_CONFIG } from "../actions/desktop-automation-config.js";
import { LEO_DESKTOP_AUTOMATION } from '../../config/leo.js';
import type { ActionResult } from "../types.js";

type DesktopActionResult = ActionResult & {
  action?: string;
  data?: Record<string, unknown>;
};

export type DesktopPluginConfig = DesktopAutomationConfig;

export const DesktopAutomationPlugin = {
  enabled: false,
  config: {
    ...DEFAULT_DESKTOP_CONFIG,
  } as DesktopPluginConfig,

  /**
   * Inicializa o plugin de automação desktop
   */
  async start(): Promise<void> {
    if (LEO_DESKTOP_AUTOMATION === false) {
      console.log('[DesktopPlugin] Desktop automation desabilitada via flag LEO_DESKTOP_AUTOMATION');
      this.enabled = false;
      return;
    }

    if (!this.enabled) {
      console.log('[DesktopPlugin] Desktop automation plugin disabled');
      return;
    }

    try {
      console.log('[DesktopPlugin] Starting desktop automation...');
      this.initializeRobotJS();
      this.initializeSandbox();
      console.log('[DesktopPlugin] Desktop automation started successfully');
    } catch (error) {
      console.error('[DesktopPlugin] Failed to start desktop automation:', error);
      this.enabled = false;
    }
  },

  /**
   * Para o plugin de automação desktop
   */
  stop(): void {
    if (!this.enabled) return;
    
    console.log('[DesktopPlugin] Stopping desktop automation...');
    this.enabled = false;
    console.log('[DesktopPlugin] Desktop automation stopped');
  },

  /**
   * Inicializa RobotJS de forma segura
   */
  async initializeRobotJS(): Promise<void> {
    if (LEO_DESKTOP_AUTOMATION === false) {
      console.log('[DesktopPlugin] RobotJS desabilitado via flag LEO_DESKTOP_AUTOMATION');
      return;
    }

    // RobotJS foi removido do projeto; manter plugin desabilitado de forma explícita.
    this.enabled = false;
    console.log("[DesktopPlugin] RobotJS removido; plugin desabilitado");
  },

  /**
   * Inicializa sandbox de segurança
   */
  initializeSandbox(): void {
    console.log("[DesktopPlugin] Sandbox não aplicável (robotjs removido)");
  },

  /**
   * Verifica se o plugin está disponível
   */
  isAvailable(): boolean {
    return this.enabled;
  },

  /**
   * Executa ação de mouse
   */
  async moveMouse(x: number, y: number): Promise<DesktopActionResult> {
    if (!this.isAvailable()) {
      return { success: false, message: 'Desktop plugin not available' };
    }

    return { success: false, message: "Desktop automation desativada" };
  },

  /**
   * Executa clique do mouse
   */
  async clickMouse(button: string = 'left', double: boolean = false): Promise<DesktopActionResult> {
    if (!this.isAvailable()) {
      return { success: false, message: 'Desktop plugin not available' };
    }

    void button;
    void double;
    return { success: false, message: "Desktop automation desativada" };
  },

  /**
   * Digita texto
   */
  async typeText(text: string): Promise<DesktopActionResult> {
    if (!this.isAvailable()) {
      return { success: false, message: 'Desktop plugin not available' };
    }

    void text;
    return { success: false, message: "Desktop automation desativada" };
  },

  /**
   * Captura tela
   */
  async captureScreen(): Promise<DesktopActionResult> {
    if (!this.isAvailable()) {
      return { success: false, message: 'Desktop plugin not available' };
    }

    return { success: false, message: "Desktop automation desativada" };
  },

  /**
   * Configura o plugin
   */
  configure(config: Partial<DesktopPluginConfig>): void {
    this.config = { ...this.config, ...config };
    // Config atual é de automação; este plugin permanece desabilitado sem RobotJS.
    this.enabled = false;
    
    console.log('[DesktopPlugin] Configuration updated:', {
      enabled: this.enabled,
      configUpdated: true
    });
  }
};

// Auto-inicialização segura
try {
  DesktopAutomationPlugin.start();
} catch (error) {
  console.warn('[DesktopPlugin] Auto-initialization failed:', error);
}
