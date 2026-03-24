/**
 * LEO Screen - Stub Implementation
 * 
 * Implementação mínima para ERP Core + LEO Básico
 * Captura de tela desativada temporariamente para reduzir erros de compilação
 */

import { insertLeoActionLog } from '../../services/ai/leo-action-logger';

export interface ScreenCaptureResult {
  success: boolean;
  path?: string;
  width?: number;
  height?: number;
  timestamp?: Date;
  message?: string;
}

export class LeoScreen {
  private isEnabled: boolean = false;

  constructor() {
    console.log("[LEO Screen STUB] Initialized in stub mode");
  }

  async capturarTela(path?: string, usuario?: string): Promise<ScreenCaptureResult> {
    console.log("[LEO Screen STUB] capturarTela called");
    
    try {
      await insertLeoActionLog({
        usuario: usuario || 'leo',
        acao: 'capturar_tela',
        entidade: 'screen',
        dados: JSON.stringify({ mode: 'stub', path }),
        resultado: 'success'
      });
    } catch (error) {
      console.error('[LEO Screen STUB] Error logging action:', error);
    }

    return {
      success: true,
      path: path || 'stub-screenshot.png',
      width: 1920,
      height: 1080,
      timestamp: new Date(),
      message: 'Screen capture not implemented - stub mode'
    };
  }

  async captureArea(x: number, y: number, width: number, height: number, path?: string, usuario?: string): Promise<ScreenCaptureResult> {
    console.log(`[LEO Screen STUB] captureArea called: ${x},${y} ${width}x${height}`);
    
    try {
      await insertLeoActionLog({
        usuario: usuario || 'leo',
        acao: 'capturar_area',
        entidade: 'screen',
        dados: JSON.stringify({ mode: 'stub', x, y, width, height, path }),
        resultado: 'success'
      });
    } catch (error) {
      console.error('[LEO Screen STUB] Error logging action:', error);
    }

    return {
      success: true,
      path: path || 'stub-area-screenshot.png',
      width: width,
      height: height,
      timestamp: new Date(),
      message: 'Area capture not implemented - stub mode'
    };
  }

  isAvailable(): boolean {
    return this.isEnabled;
  }

  enable(): void {
    this.isEnabled = true;
    console.log("[LEO Screen STUB] Enabled (stub mode)");
  }

  disable(): void {
    this.isEnabled = false;
    console.log("[LEO Screen STUB] Disabled");
  }
}

export const leoScreen = new LeoScreen();

export default leoScreen;
