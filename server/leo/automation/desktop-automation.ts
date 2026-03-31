/**
 * LEO Desktop Automation - Stub Implementation
 * 
 * Implementação mínima para ERP Core + LEO Básico
 * Automação desktop desativada temporariamente para reduzir erros de compilação
 */

import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';

export interface Point {
  x: number;
  y: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface MouseAction {
  type: 'click' | 'doubleClick' | 'rightClick' | 'move' | 'drag';
  position?: Point;
  duration?: number;
}

export interface KeyboardAction {
  type: 'type' | 'press' | 'hold' | 'release';
  key?: string;
  text?: string;
  duration?: number;
}

export class DesktopAutomation {
  private isEnabled: boolean = false;

  constructor() {
    console.log("[LEO Desktop Automation STUB] Initialized in stub mode");
  }

  async captureScreen(): Promise<Buffer> {
    console.log("[LEO Desktop Automation STUB] captureScreen called");
    return Buffer.from("stub-image-data");
  }

  async captureRegion(x: number, y: number, width: number, height: number): Promise<Buffer> {
    console.log(`[LEO Desktop Automation STUB] captureRegion called: ${x},${y} ${width}x${height}`);
    return Buffer.from("stub-region-data");
  }

  async getScreenSize(): Promise<ScreenSize> {
    console.log("[LEO Desktop Automation STUB] getScreenSize called");
    return { width: 1920, height: 1080 };
  }

  async moveMouse(position: Point): Promise<void> {
    console.log(`[LEO Desktop Automation STUB] moveMouse to: ${position.x},${position.y}`);
  }

  async click(position?: Point): Promise<void> {
    console.log(`[LEO Desktop Automation STUB] click at: ${position?.x || 'current'},${position?.y || 'current'}`);
  }

  async typeText(text: string): Promise<void> {
    console.log(`[LEO Desktop Automation STUB] typeText: "${text}"`);
  }

  async pressKey(key: string): Promise<void> {
    console.log(`[LEO Desktop Automation STUB] pressKey: "${key}"`);
  }

  isAvailable(): boolean {
    return this.isEnabled;
  }

  enable(): void {
    this.isEnabled = true;
    console.log("[LEO Desktop Automation STUB] Enabled (stub mode)");
  }

  disable(): void {
    this.isEnabled = false;
    console.log("[LEO Desktop Automation STUB] Disabled");
  }
}

export const desktopAutomation = new DesktopAutomation();

export default desktopAutomation;
