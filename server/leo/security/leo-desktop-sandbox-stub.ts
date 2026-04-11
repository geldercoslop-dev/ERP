/**
 * DESKTOP AUTOMATION MODULE (TEMPORARILY DISABLED)
 * 
 * Stub para manter compatibilidade enquanto o módulo está desativado
 * Substitui as funcionalidades do leo-desktop-sandbox.ts
 */

import type { Payload } from "../../../shared/types/index.js";
import { LEO_DESKTOP_AUTOMATION } from '../../config/leo.js';

export interface SandboxConfig {
  allowedApplications: string[];
  allowedDirectories: string[];
  blockedApplications: string[];
  blockedDirectories: string[];
  maxExecutionTime: number;
  requireUserApproval: boolean;
  auditAllActions: boolean;
}

export interface SandboxResult {
  success: boolean;
  message: string;
  blockedReason?: string;
  warnings?: string[];
  data?: unknown;
}

export interface DesktopAction {
  type: string;
  target: string;
  parameters: Record<string, unknown>;
  userId?: string;
}

const DESKTOP_DISABLED_MESSAGE = 'Desktop automation desativada';

/**
 * Stub para manter compatibilidade enquanto o módulo está desativado
 * Substitui as funcionalidades do leo-desktop-sandbox.ts
 */
export class LeoDesktopSandbox {
  private static instance: LeoDesktopSandbox;
  private config: SandboxConfig;
  private auditLog: Array<{
    timestamp: Date;
    action: DesktopAction;
    result: SandboxResult;
    userId?: string;
  }> = [];

  private constructor() {
    this.config = {
      allowedApplications: [],
      allowedDirectories: [],
      blockedApplications: [],
      blockedDirectories: [],
      maxExecutionTime: 30,
      requireUserApproval: true,
      auditAllActions: true
    };
  }

  public static getInstance(): LeoDesktopSandbox {
    if (!LeoDesktopSandbox.instance) {
      LeoDesktopSandbox.instance = new LeoDesktopSandbox();
    }
    return LeoDesktopSandbox.instance;
  }

  async executeAction(action: DesktopAction): Promise<SandboxResult> {
    // Verificar flag global antes de executar qualquer ação
    if (LEO_DESKTOP_AUTOMATION === false) {
      return {
        success: false,
        message: 'Desktop automation desativada',
        blockedReason: 'Desktop automation disabled'
      };
    }
    
    return {
      success: false,
      message: 'Sandbox de desktop temporariamente desativado',
      blockedReason: 'Desktop automation disabled'
    };
  }

  clearAuditLog(): void {
    this.auditLog = [];
  }

  isRobotJSAvailable(): boolean {
    return false;
  }

  generateSecurityReport(): {
    totalActions: number;
    blockedActions: number;
    successfulActions: number;
    averageExecutionTime: number;
    mostUsedApplications: Array<{ app: string; count: number }>;
    recentBlockedActions: Array<{
      timestamp: Date;
      action: string;
      reason: string;
    }>;
  } {
    return {
      totalActions: 0,
      blockedActions: 0,
      successfulActions: 0,
      averageExecutionTime: 0,
      mostUsedApplications: [],
      recentBlockedActions: []
    };
  }
}

export const leoDesktopSandbox = LeoDesktopSandbox.getInstance();
