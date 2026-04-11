/**
 * System Controller
 * 
 * Controla operações do sistema
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { ValidationError, InfrastructureError } from '../../_core/errors/typed-errors.js';

const execAsync = promisify(exec);

export interface SystemAction {
  action: string;
  parameters?: Record<string, any>;
}

export interface SystemResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
  executionTime?: number;
}

export class SystemController {
  /**
   * Executa uma ação do sistema
   */
  async execute(action: string, parameters?: Record<string, any>): Promise<SystemResult> {
    try {
      switch (action) {
        case 'executeCommand':
          return await this.executeCommand(parameters?.command, parameters?.timeout);
        case 'readFile':
          return await this.readFileContent(parameters?.filePath);
        case 'writeFile':
          return await this.writeFileContent(parameters?.filePath, parameters?.content);
        case 'getSystemInfo':
          return await this.getSystemInfo();
        case 'getDirectoryListing':
          return await this.getDirectoryListing(parameters?.directoryPath);
        case 'createDirectory':
          return await this.createDirectory(parameters?.directoryPath);
        case 'deleteFile':
          return await this.deleteFile(parameters?.filePath);
        case 'getEnvironmentVariables':
          return await this.getEnvironmentVariables();
        default:
          throw new ValidationError(`Unknown system action: ${action}`);
      }
    } catch (error) {
      return {
        success: false,
        message: `System action failed: ${action}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Executa um comando do sistema
   */
  private async executeCommand(command: string, timeout: number = 30000): Promise<SystemResult> {
    if (!command) {
      throw new ValidationError('Command is required');
    }

    // Validação de segurança
    const dangerousCommands = [
      'format', 'del', 'rmdir', 'shutdown', 'reboot',
      'rm -rf', 'sudo', 'chmod 777', 'dd if=',
      'net user', 'net localgroup'
    ];

    for (const dangerous of dangerousCommands) {
      if (command.toLowerCase().includes(dangerous)) {
        throw new ValidationError(`Command contains dangerous operation: ${dangerous}`);
      }
    }

    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(command, { 
        timeout: timeout,
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 // 1MB
      });

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        message: 'Command executed successfully',
        data: {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command,
          executionTime
        },
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        message: 'Command execution failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {
          command,
          executionTime
        },
        executionTime
      };
    }
  }

  /**
   * Lê conteúdo de arquivo
   */
  private async readFileContent(filePath: string): Promise<SystemResult> {
    if (!filePath) {
      throw new ValidationError('File path is required');
    }

    try {
      // Validação de segurança - não permitir acesso a arquivos sensíveis
      const restrictedPaths = [
        'C:\\Windows\\System32\\config',
        'C:\\Windows\\System32\\drivers',
        'C:\\ProgramData',
        'C:\\Users\\Default'
      ];

      const normalizedPath = filePath.toLowerCase();
      for (const restricted of restrictedPaths) {
        if (normalizedPath.includes(restricted.toLowerCase())) {
          throw new ValidationError(`Access to restricted path denied: ${restricted}`);
        }
      }

      const content = await readFile(filePath, 'utf-8');
      
      return {
        success: true,
        message: `File read successfully`,
        data: { filePath, content, size: content.length }
      };

    } catch (error) {
      throw new InfrastructureError(`Failed to read file ${filePath}: ${error}`);
    }
  }

  /**
   * Escreve conteúdo em arquivo
   */
  private async writeFileContent(filePath: string, content: string): Promise<SystemResult> {
    if (!filePath || !content) {
      throw new ValidationError('File path and content are required');
    }

    try {
      // Validação de segurança
      const restrictedPaths = [
        'C:\\Windows\\System32',
        'C:\\Program Files',
        'C:\\Program Files (x86)'
      ];

      const normalizedPath = filePath.toLowerCase();
      for (const restricted of restrictedPaths) {
        if (normalizedPath.startsWith(restricted.toLowerCase())) {
          throw new ValidationError(`Write access denied to protected path: ${restricted}`);
        }
      }

      await writeFile(filePath, content, 'utf-8');
      
      return {
        success: true,
        message: `File written successfully`,
        data: { filePath, size: content.length }
      };

    } catch (error) {
      throw new InfrastructureError(`Failed to write file ${filePath}: ${error}`);
    }
  }

  /**
   * Obtém informações do sistema
   */
  private async getSystemInfo(): Promise<SystemResult> {
    try {
      const commands = [
        'systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"System Type"',
        'wmic cpu get name',
        'wmic computersystem get totalphysicalmemory',
        'wmic diskdrive get size,model'
      ];

      const results = await Promise.allSettled(
        commands.map(cmd => execAsync(cmd))
      );

      const systemInfo = {
        os: results[0].status === 'fulfilled' ? results[0].value.stdout : '',
        cpu: results[1].status === 'fulfilled' ? results[1].value.stdout : '',
        memory: results[2].status === 'fulfilled' ? results[2].value.stdout : '',
        disk: results[3].status === 'fulfilled' ? results[3].value.stdout : '',
        timestamp: new Date().toISOString()
      };

      return {
        success: true,
        message: 'System information retrieved',
        data: systemInfo
      };

    } catch (error) {
      throw new InfrastructureError(`Failed to get system info: ${error}`);
    }
  }

  /**
   * Lista conteúdo de diretório
   */
  private async getDirectoryListing(directoryPath: string): Promise<SystemResult> {
    if (!directoryPath) {
      throw new ValidationError('Directory path is required');
    }

    try {
      const { stdout } = await execAsync(`dir "${directoryPath}" /b`);
      const items = stdout.split('\n').filter(item => item.trim() !== '');

      return {
        success: true,
        message: `Directory listing retrieved`,
        data: { directoryPath, items, count: items.length }
      };

    } catch (error) {
      throw new InfrastructureError(`Failed to list directory ${directoryPath}: ${error}`);
    }
  }

  /**
   * Cria diretório
   */
  private async createDirectory(directoryPath: string): Promise<SystemResult> {
    if (!directoryPath) {
      throw new ValidationError('Directory path is required');
    }

    try {
      await execAsync(`mkdir "${directoryPath}"`);

      return {
        success: true,
        message: `Directory created successfully`,
        data: { directoryPath }
      };

    } catch (error) {
      throw new InfrastructureError(`Failed to create directory ${directoryPath}: ${error}`);
    }
  }

  /**
   * Deleta arquivo
   */
  private async deleteFile(filePath: string): Promise<SystemResult> {
    if (!filePath) {
      throw new ValidationError('File path is required');
    }

    try {
      // Validação de segurança
      const restrictedPaths = [
        'C:\\Windows\\System32',
        'C:\\Program Files',
        'C:\\Program Files (x86)'
      ];

      const normalizedPath = filePath.toLowerCase();
      for (const restricted of restrictedPaths) {
        if (normalizedPath.startsWith(restricted.toLowerCase())) {
          throw new ValidationError(`Delete access denied to protected path: ${restricted}`);
        }
      }

      await execAsync(`del "${filePath}"`);

      return {
        success: true,
        message: `File deleted successfully`,
        data: { filePath }
      };

    } catch (error) {
      throw new InfrastructureError(`Failed to delete file ${filePath}: ${error}`);
    }
  }

  /**
   * Obtém variáveis de ambiente
   */
  private async getEnvironmentVariables(): Promise<SystemResult> {
    try {
      const { stdout } = await execAsync('set');
      const lines = stdout.split('\n');
      const envVars: Record<string, string> = {};

      for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          envVars[match[1]] = match[2];
        }
      }

      return {
        success: true,
        message: 'Environment variables retrieved',
        data: { variables: envVars, count: Object.keys(envVars).length }
      };

    } catch (error) {
      throw new InfrastructureError(`Failed to get environment variables: ${error}`);
    }
  }

  /**
   * Lista ações disponíveis
   */
  getAvailableActions(): string[] {
    return [
      'executeCommand',
      'readFile',
      'writeFile',
      'getSystemInfo',
      'getDirectoryListing',
      'createDirectory',
      'deleteFile',
      'getEnvironmentVariables'
    ];
  }
}
