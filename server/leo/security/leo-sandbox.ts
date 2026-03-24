/**
 * Sandbox de Segurança para o Agente LEO
 * 
 * Camada de proteção para automação e acesso ao sistema
 * Impede ações perigosas sem confirmação explícita
 */

import { existsSync, statSync } from 'fs';
import { resolve, normalize } from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { logInfo, logError, logWarn } from '../../_core/logger';

export interface SandboxRule {
  id: string;
  action: string;
  allowed: boolean;
  requiresConfirmation: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  restrictions?: string[];
}

export interface SandboxResult {
  allowed: boolean;
  reason: string;
  requiresConfirmation: boolean;
  riskLevel: string;
  warnings?: string[];
}

/** Ação avaliada pelo sandbox (diferente do tipo LeoAction em shared/types) */
export interface LeoSandboxAction {
  type: 'shell' | 'database' | 'file_access' | 'financial' | 'automation';
  action: string;
  parameters?: Record<string, unknown>;
  userId?: string;
  context?: unknown;
}

/**
 * Sandbox de segurança do agente LEO
 */
class LeoSandbox {
  private static instance: LeoSandbox;
  private rules: SandboxRule[] = [];
  private blockedPaths: string[] = [];
  private allowedApplications: string[] = [];
  private confirmationRequired: Set<string> = new Set();

  private constructor() {
    this.initializeRules();
    logInfo('Sandbox do agente LEO inicializado');
  }

  public static getInstance(): LeoSandbox {
    if (!LeoSandbox.instance) {
      LeoSandbox.instance = new LeoSandbox();
    }
    return LeoSandbox.instance;
  }

  /**
   * Inicializa regras de segurança
   */
  private initializeRules(): void {
    // LEO NUNCA pode executar:
    this.rules = [
      {
        id: 'shell_commands',
        action: 'shell',
        allowed: false,
        requiresConfirmation: false,
        riskLevel: 'critical',
        description: 'LEO NUNCA pode executar comandos shell diretamente',
        restrictions: ['cmd', 'powershell', 'bash', 'sh']
      },
      {
        id: 'database_direct',
        action: 'database_direct',
        allowed: false,
        requiresConfirmation: false,
        riskLevel: 'critical',
        description: 'LEO NUNCA pode alterar banco diretamente',
        restrictions: ['DELETE', 'DROP', 'TRUNCATE', 'UPDATE', 'INSERT']
      },
      {
        id: 'financial_values',
        action: 'financial_modify',
        allowed: false,
        requiresConfirmation: true,
        riskLevel: 'critical',
        description: 'LEO NUNCA pode alterar valores financeiros sem confirmação',
        restrictions: ['price', 'value', 'total', 'amount', 'cost']
      },
      {
        id: 'critical_paths',
        action: 'critical_path_access',
        allowed: false,
        requiresConfirmation: true,
        riskLevel: 'high',
        description: 'LEO NUNCA pode acessar pastas críticas sem confirmação',
        restrictions: ['C:\\Windows', 'C:\\Program Files', 'C:\\System32']
      },
      {
        id: 'system_config',
        action: 'system_config',
        allowed: false,
        requiresConfirmation: true,
        riskLevel: 'high',
        description: 'LEO NUNCA pode modificar configurações do sistema',
        restrictions: ['registry', 'services', 'startup']
      }
    ];

    // Diretórios bloqueados
    this.blockedPaths = [
      'C:\\Windows',
      'C:\\Windows\\System32',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\Users\\Administrator',
      'C:\\Boot',
      'C:\\EFI'
    ];

    // Aplicações permitidas
    this.allowedApplications = [
      'notepad.exe',
      'calc.exe',
      'mspaint.exe',
      'explorer.exe',
      'chrome.exe',
      'firefox.exe',
      'excel.exe',
      'winword.exe'
    ];

    // Ações que requerem confirmação
    this.confirmationRequired = new Set([
      'financial_modify',
      'critical_path_access',
      'system_config',
      'database_direct',
      'file_delete'
    ]);
  }

  /**
   * Verifica se uma ação é permitida
   */
  async checkAction(action: LeoSandboxAction): Promise<SandboxResult> {
    logInfo(`Verificando ação no sandbox: ${action.type} - ${action.action}`, {
      extra: { action, userId: action.userId }
    });

    // Verificar regras específicas
    const rule = this.rules.find(r => 
      r.action === action.action || r.action === action.type
    );

    if (rule) {
      if (!rule.allowed) {
        logWarn(`Ação bloqueada por regra: ${rule.description}`);
        return {
          allowed: false,
          reason: rule.description,
          requiresConfirmation: rule.requiresConfirmation,
          riskLevel: rule.riskLevel
        };
      }

      if (rule.requiresConfirmation) {
        logWarn(`Ação requer confirmação: ${rule.description}`);
        return {
          allowed: false,
          reason: `Ação requer confirmação explícita: ${rule.description}`,
          requiresConfirmation: true,
          riskLevel: rule.riskLevel
        };
      }
    }

    // Verificações específicas por tipo
    switch (action.type) {
      case 'shell':
        return await this.checkShellAction(action);
      case 'database':
        return await this.checkDatabaseAction(action);
      case 'file_access':
        return await this.checkFileAccessAction(action);
      case 'financial':
        return await this.checkFinancialAction(action);
      case 'automation':
        return await this.checkAutomationAction(action);
      default:
        return {
          allowed: false,
          reason: `Tipo de ação desconhecido: ${action.type}`,
          requiresConfirmation: false,
          riskLevel: 'high'
        };
    }
  }

  /**
   * Verifica ação de shell
   */
  private async checkShellAction(action: LeoSandboxAction): Promise<SandboxResult> {
    const command = (action.parameters as Record<string, unknown>)?.command || action.action;
    
    // Verificar comandos perigosos
    const dangerousCommands = [
      'format', 'del', 'rmdir', 'rd', 'shutdown', 'reboot',
      'regedit', 'net user', 'net localgroup', 'powershell',
      'cmd', 'taskkill', 'wmic', 'schtasks'
    ];

    const commandLower = (command as string).toLowerCase();
    const isDangerous = dangerousCommands.some(cmd => 
      commandLower.includes(cmd)
    );

    if (isDangerous) {
      return {
        allowed: false,
        reason: `Comando shell perigoso detectado: ${command}`,
        requiresConfirmation: true,
        riskLevel: 'critical'
      };
    }

    return {
      allowed: true,
      reason: 'Comando shell permitido',
      requiresConfirmation: false,
      riskLevel: 'medium'
    };
  }

  /**
   * Verifica ação de banco de dados
   */
  private async checkDatabaseAction(action: LeoSandboxAction): Promise<SandboxResult> {
    const operation = String(action.parameters?.operation ?? action.action);
    
    // Operações perigosas no banco
    const dangerousOperations = [
      'DELETE', 'DROP', 'TRUNCATE', 'UPDATE', 'INSERT',
      'ALTER', 'CREATE', 'EXEC', 'GRANT', 'REVOKE'
    ];

    const operationUpper = operation.toUpperCase();
    const isDangerous = dangerousOperations.some(op => 
      operationUpper.includes(op)
    );

    if (isDangerous) {
      return {
        allowed: false,
        reason: `Operação de banco perigosa: ${operation}`,
        requiresConfirmation: true,
        riskLevel: 'critical'
      };
    }

    return {
      allowed: true,
      reason: 'Operação de banco permitida',
      requiresConfirmation: false,
      riskLevel: 'medium'
    };
  }

  /**
   * Verifica acesso a arquivos
   */
  private async checkFileAccessAction(action: LeoSandboxAction): Promise<SandboxResult> {
    const params = (action.parameters && typeof action.parameters === 'object') ? action.parameters as Record<string, unknown> : {};
    const filePath = String(params.path ?? action.action);
    
    if (!filePath) {
      return {
        allowed: false,
        reason: 'Caminho do arquivo não especificado',
        requiresConfirmation: false,
        riskLevel: 'high'
      };
    }

    // Normalizar e verificar caminho
    const normalizedPath = normalize(resolve(filePath));
    
    // Verificar se está em diretório bloqueado
    const isBlockedPath = this.blockedPaths.some(blockedPath => 
      normalizedPath.toLowerCase().startsWith(blockedPath.toLowerCase())
    );

    if (isBlockedPath) {
      return {
        allowed: false,
        reason: `Acesso a diretório bloqueado: ${normalizedPath}`,
        requiresConfirmation: true,
        riskLevel: 'high'
      };
    }

    // Verificar se arquivo existe
    if (!existsSync(normalizedPath)) {
      return {
        allowed: false,
        reason: `Arquivo não encontrado: ${normalizedPath}`,
        requiresConfirmation: false,
        riskLevel: 'medium'
      };
    }

    // Verificar tipo de arquivo
    try {
      const stats = statSync(normalizedPath);
      const ext = normalizedPath.split('.').pop()?.toLowerCase();
      
      // Arquivos executáveis requerem confirmação
      if (stats.isFile() && (ext === 'exe' || ext === 'bat' || ext === 'cmd' || ext === 'ps1')) {
        return {
          allowed: false,
          reason: `Arquivo executável requer confirmação: ${normalizedPath}`,
          requiresConfirmation: true,
          riskLevel: 'high'
        };
      }
    } catch (error) {
      logError('Erro ao verificar arquivo', { extra: { filePath: normalizedPath, error } });
    }

    return {
      allowed: true,
      reason: 'Acesso ao arquivo permitido',
      requiresConfirmation: false,
      riskLevel: 'low'
    };
  }

  /**
   * Verifica ação financeira
   */
  private async checkFinancialAction(action: LeoSandboxAction): Promise<SandboxResult> {
    const operation = (action.parameters as Record<string, unknown>)?.operation || action.action;
    const value = (action.parameters as Record<string, unknown>)?.value;
    
    // Operações financeiras sempre requerem confirmação
    if (!action.userId) {
      return {
        allowed: false,
        reason: 'Operação financeira requer usuário autenticado',
        requiresConfirmation: true,
        riskLevel: 'critical'
      };
    }

    // Verificar se está tentando modificar valores
    if (value && typeof value === 'number') {
      // Limites de segurança para valores financeiros
      const maxAllowedValue = 10000; // R$ 10.000
      
      if (value > maxAllowedValue) {
        return {
          allowed: false,
          reason: `Valor financeiro excede limite permitido: R$ ${maxAllowedValue}`,
          requiresConfirmation: true,
          riskLevel: 'critical'
        };
      }
    }

    // Operações perigosas
    const dangerousOperations = [
      'delete', 'remove', 'cancel', 'refund', 'adjust',
      'modify', 'update', 'create_invoice', 'delete_payment'
    ];

    const operationLower = (operation as string).toLowerCase();
    const isDangerous = dangerousOperations.some(op => 
      operationLower.includes(op)
    );

    if (isDangerous) {
      return {
        allowed: false,
        reason: `Operação financeira perigosa: ${operation}`,
        requiresConfirmation: true,
        riskLevel: 'critical'
      };
    }

    return {
      allowed: false, // Por padrão, operações financeiras requerem confirmação manual
      reason: 'Operação financeira requer confirmação manual do usuário',
      requiresConfirmation: true,
      riskLevel: 'high'
    };
  }

  /**
   * Verifica ação de automação
   */
  private async checkAutomationAction(action: LeoSandboxAction): Promise<SandboxResult> {
    const params = (action.parameters && typeof action.parameters === 'object') ? action.parameters as Record<string, unknown> : {};
    const automationType = String(params.type ?? action.action);
    
    // Automações críticas
    const criticalAutomations = [
      'system_shutdown', 'system_reboot', 'service_stop',
      'service_start', 'registry_modify', 'user_create',
      'user_delete', 'permission_change'
    ];

    const isCritical = criticalAutomations.some(auto => 
      automationType.toLowerCase().includes(auto)
    );

    if (isCritical) {
      return {
        allowed: false,
        reason: `Automação crítica bloqueada: ${automationType}`,
        requiresConfirmation: true,
        riskLevel: 'critical'
      };
    }

    return {
      allowed: true,
      reason: 'Automação permitida',
      requiresConfirmation: false,
      riskLevel: 'medium'
    };
  }

  /**
   * Executa ação com verificação de segurança
   */
  async executeAction(action: LeoSandboxAction): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    warnings?: string[];
  }> {
    try {
      // Verificar se ação é permitida
      const checkResult = await this.checkAction(action);
      
      if (!checkResult.allowed) {
        if (checkResult.requiresConfirmation) {
          // Registrar que ação requer confirmação
          logWarn(`Ação requer confirmação: ${checkResult.reason}`, {
            extra: { action, checkResult }
          });
          
          return {
            success: false,
            error: `Ação requer confirmação: ${checkResult.reason}`,
            warnings: checkResult.warnings
          };
        } else {
          // Ação completamente bloqueada
          logError(`Ação bloqueada pelo sandbox: ${checkResult.reason}`, {
            extra: { action, checkResult }
          });
          
          return {
            success: false,
            error: `Ação bloqueada: ${checkResult.reason}`,
            warnings: checkResult.warnings
          };
        }
      }

      // Executar ação permitida
      logInfo(`Executando ação permitida: ${action.type} - ${action.action}`, {
        extra: { action }
      });

      const result = await this.executeAllowedAction(action);
      
      return {
        success: true,
        result,
        warnings: checkResult.warnings
      };

    } catch (error) {
      logError('Erro ao executar ação no sandbox', {
        extra: { action, error: error instanceof Error ? error.message : error }
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Executa ação já verificada como permitida
   */
  private async executeAllowedAction(action: LeoSandboxAction): Promise<unknown> {
    switch (action.type) {
      case 'shell':
        return await this.executeShellAction(action);
      case 'file_access':
        return await this.executeFileAccessAction(action);
      case 'automation':
        return await this.executeAutomationAction(action);
      default:
        throw new Error(`Tipo de ação não implementado: ${action.type}`);
    }
  }

  /**
   * Executa comando shell permitido
   */
  private async executeShellAction(action: LeoSandboxAction): Promise<unknown> {
    const command = (action.parameters as Record<string, unknown>)?.command || action.action;
    const execAsync = promisify(exec);
    
    try {
      const { stdout, stderr } = await execAsync(command as string);
      return { stdout, stderr };
    } catch (error) {
      throw new Error(`Erro ao executar comando: ${error}`);
    }
  }

  /**
   * Executa acesso a arquivo permitido
   */
  private async executeFileAccessAction(action: LeoSandboxAction): Promise<unknown> {
    const filePath = (action.parameters as Record<string, unknown>)?.path || action.action;
    const operation = (action.parameters as Record<string, unknown>)?.operation || 'read';
    
    switch (operation) {
      case 'read':
        // Implementar leitura de arquivo
        return { path: filePath, operation: 'read' };
      case 'open':
        // Implementar abertura de arquivo
        return { path: filePath, operation: 'open' };
      default:
        throw new Error(`Operação de arquivo não implementada: ${operation}`);
    }
  }

  /**
   * Executa automação permitida
   */
  private async executeAutomationAction(action: LeoSandboxAction): Promise<unknown> {
    const params = (action.parameters && typeof action.parameters === 'object') ? action.parameters as Record<string, unknown> : {};
    const automationType = String(params.type ?? action.action);
    
    return {
      type: 'automation',
      action: automationType,
      timestamp: new Date(),
      result: 'Automação executada com sucesso'
    };
  }

  /**
   * Obtém regras de segurança
   */
  getRules(): SandboxRule[] {
    return [...this.rules];
  }

  /**
   * Adiciona nova regra de segurança
   */
  addRule(rule: SandboxRule): void {
    this.rules.push(rule);
    logInfo(`Nova regra de segurança adicionada: ${rule.id}`);
  }

  /**
   * Remove regra de segurança
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      logInfo(`Regra de segurança removida: ${ruleId}`);
      return true;
    }
    return false;
  }

  /**
   * Verifica se aplicação é permitida
   */
  isApplicationAllowed(appName: string): boolean {
    return this.allowedApplications.some(allowed => 
      appName.toLowerCase().includes(allowed.toLowerCase())
    );
  }

  /**
   * Obtém estatísticas do sandbox
   */
  getStats(): {
    totalRules: number;
    blockedPaths: number;
    allowedApplications: number;
    confirmationRequiredActions: number;
  } {
    return {
      totalRules: this.rules.length,
      blockedPaths: this.blockedPaths.length,
      allowedApplications: this.allowedApplications.length,
      confirmationRequiredActions: this.confirmationRequired.size
    };
  }

  /**
   * Limpa logs e estatísticas
   */
  clear(): void {
    logInfo('Sandbox do LEO limpo');
  }

  /**
   * Encerra o sandbox
   */
  shutdown(): void {
    logInfo('Sandbox do LEO encerrado');
    this.rules = [];
    this.blockedPaths = [];
    this.allowedApplications = [];
    this.confirmationRequired.clear();
  }
}

// Exportar instância singleton
export const leoSandbox = LeoSandbox.getInstance();
