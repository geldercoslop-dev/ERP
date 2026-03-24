/**
 * Controle de Computador do LEO
 * 
 * Permite que o Leo execute scripts existentes e comandos do sistema
 * usando Node.js child_process
 */

import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { insertLeoActionLog } from '../../services/ai/leo-action-logger';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { leoDesktopSandbox, type DesktopAction } from '../security/leo-desktop-sandbox';
import type { ActionResult } from '../types';
import { LEO_DESKTOP_AUTOMATION } from '../../config/leo';
import { leoComputerControl as computerStub } from './leo-computer-control-stub';

const execAsync = promisify(exec);

export interface ScriptResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
}

export interface FileOperation {
  type: 'open' | 'list' | 'create' | 'delete';
  path: string;
  content?: string;
}

/**
 * Classe para controle de computador pelo Leo
 */
export class LeoComputerControl {
  private static instance: LeoComputerControl;
  private activeProcesses: Map<string, ChildProcess> = new Map();

  private constructor() {}

  public static getInstance(): LeoComputerControl {
    if (!LeoComputerControl.instance) {
      LeoComputerControl.instance = new LeoComputerControl();
    }
    return LeoComputerControl.instance;
  }

  /**
   * Executa um script específico através do sandbox
   */
  async executarScript(scriptPath: string, args?: string[], usuario?: string): Promise<ScriptResult> {
    const startTime = Date.now();
    const scriptId = `script_${Date.now()}`;

    try {
      // Normalizar o caminho do script
      const fullPath = this.resolveScriptPath(scriptPath);
      
      if (!existsSync(fullPath)) {
        throw new Error(`Script não encontrado: ${fullPath}`);
      }

      console.log(`[LeoComputerControl] Executando script via sandbox: ${fullPath}`);

      // Usar sandbox para validação e execução
      const action: DesktopAction = {
        type: 'execute_script',
        target: fullPath,
        parameters: { args },
        userId: usuario
      };

      const sandboxResult = await leoDesktopSandbox.executeAction(action);
      
      const executionTime = Date.now() - startTime;

      // Registrar log
      await this.logAction(usuario || 'leo', 'executar_script', fullPath, {
        success: sandboxResult.success,
        executionTime,
        sandboxBlocked: !sandboxResult.success && sandboxResult.blockedReason,
        blockedReason: sandboxResult.blockedReason,
        warnings: sandboxResult.warnings
      });

      if (!sandboxResult.success) {
        return {
          success: false,
          stdout: '',
          stderr: sandboxResult.blockedReason || 'Erro de segurança do sandbox',
          exitCode: -1,
          executionTime,
        };
      }

      const data = sandboxResult.data as { stdout?: unknown; stderr?: unknown } | undefined;
      return {
        success: true,
        stdout: String(data?.stdout ?? '') || 'Script executado com sucesso',
        stderr: String(data?.stderr ?? ''),
        exitCode: 0,
        executionTime,
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('[LeoComputerControl] Erro ao executar script:', error);

      const result: ScriptResult = {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Erro desconhecido',
        exitCode: -1,
        executionTime,
      };

      await this.logAction(usuario || 'leo', 'executar_script', scriptPath, {
        success: false,
        executionTime,
        error: result.stderr,
      });

      return result;
    }
  }

  /**
   * Executa um comando do sistema
   */
  async executarComando(command: string, args?: string[], usuario?: string): Promise<ScriptResult> {
    const startTime = Date.now();

    try {
      console.log(`[LeoComputerControl] Executando comando: ${command} ${args?.join(' ') || ''}`);

      const result = await this.executeCommand(command, args || [], {
        timeout: 30000, // 30 segundos timeout
      });

      const executionTime = Date.now() - startTime;

      // Registrar log
      await this.logAction(usuario || 'leo', 'executar_comando', command, {
        success: result.success,
        executionTime,
        stdout: result.stdout,
        stderr: result.stderr,
      });

      return {
        ...result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('[LeoComputerControl] Erro ao executar comando:', error);

      const result: ScriptResult = {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Erro desconhecido',
        exitCode: -1,
        executionTime,
      };

      await this.logAction(usuario || 'leo', 'executar_comando', command, {
        success: false,
        executionTime,
        error: result.stderr,
      });

      return result;
    }
  }

  /**
   * Abre um arquivo ou pasta
   */
  async abrirArquivo(filePath: string, usuario?: string): Promise<ScriptResult> {
    const startTime = Date.now();

    try {
      const fullPath = resolve(filePath);
      
      if (!existsSync(fullPath)) {
        throw new Error(`Arquivo/pasta não encontrado: ${fullPath}`);
      }

      console.log(`[LeoComputerControl] Abrindo: ${fullPath}`);

      // Comando baseado no SO
      const command = process.platform === 'win32' ? 'start' : 
                     process.platform === 'darwin' ? 'open' : 'xdg-open';

      const result = await this.executeCommand(command, [fullPath], {
        timeout: 5000,
      });

      const executionTime = Date.now() - startTime;

      await this.logAction(usuario || 'leo', 'abrir_arquivo', fullPath, {
        success: result.success,
        executionTime,
      });

      return {
        ...result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('[LeoComputerControl] Erro ao abrir arquivo:', error);

      const result: ScriptResult = {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Erro desconhecido',
        exitCode: -1,
        executionTime,
      };

      await this.logAction(usuario || 'leo', 'abrir_arquivo', filePath, {
        success: false,
        executionTime,
        error: result.stderr,
      });

      return result;
    }
  }

  /**
   * Lista arquivos em um diretório
   */
  async listarArquivos(dirPath: string, usuario?: string): Promise<ScriptResult> {
    const startTime = Date.now();

    try {
      const fullPath = resolve(dirPath);
      
      if (!existsSync(fullPath)) {
        throw new Error(`Diretório não encontrado: ${fullPath}`);
      }

      console.log(`[LeoComputerControl] Listando arquivos em: ${fullPath}`);

      // Comando para listar arquivos
      const command = process.platform === 'win32' ? 'dir' : 'ls';
      const args = process.platform === 'win32' ? ['/B', fullPath] : ['-la', fullPath];

      const result = await this.executeCommand(command, args, {
        timeout: 10000,
      });

      const executionTime = Date.now() - startTime;

      await this.logAction(usuario || 'leo', 'listar_arquivos', fullPath, {
        success: result.success,
        executionTime,
      });

      return {
        ...result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('[LeoComputerControl] Erro ao listar arquivos:', error);

      const result: ScriptResult = {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Erro desconhecido',
        exitCode: -1,
        executionTime,
      };

      await this.logAction(usuario || 'leo', 'listar_arquivos', dirPath, {
        success: false,
        executionTime,
        error: result.stderr,
      });

      return result;
    }
  }

  /**
   * Executa scripts pré-mapeados do sistema
   */
  async executarScriptSistema(scriptName: string, usuario?: string): Promise<ScriptResult> {
    const scriptsMapeados: Record<string, string> = {
      'iniciar_dev': 'BOTAO_1_INICIAR_DEV.bat',
      'testar_saude': 'BOTAO_2_TESTAR_SAUDE.bat',
      'backup_db': 'BOTAO_3_BACKUP_DB_DEV.bat',
      'commit_push': 'BOTAO_4_COMMIT_PUSH.bat',
    };

    const scriptFile = scriptsMapeados[scriptName];
    if (!scriptFile) {
      return {
        success: false,
        stdout: '',
        stderr: `Script não mapeado: ${scriptName}`,
        exitCode: -1,
        executionTime: 0,
      };
    }

    const projectRoot = process.cwd();
    const scriptPath = join(projectRoot, scriptFile);

    return await this.executarScript(scriptPath, [], usuario);
  }

  /**
   * Executa um comando genérico com tratamento avançado
   */
  private async executeCommand(
    command: string, 
    args: string[], 
    options: { cwd?: string; timeout?: number }
  ): Promise<Omit<ScriptResult, 'executionTime'>> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        shell: true,
        stdio: 'pipe',
      });

      const timeout = options.timeout ? setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          stdout,
          stderr: stderr || 'Timeout',
          exitCode: null,
        });
      }, options.timeout) : null;

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (timeout) clearTimeout(timeout);
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code,
        });
      });

      child.on('error', (error) => {
        if (timeout) clearTimeout(timeout);
        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: null,
        });
      });
    });
  }

  /**
   * Resolve o caminho completo do script
   */
  private resolveScriptPath(scriptPath: string): string {
    // Se for caminho relativo, usar o diretório raiz do projeto
    if (!scriptPath.startsWith('/') && !scriptPath.includes(':')) {
      return resolve(process.cwd(), scriptPath);
    }
    
    return resolve(scriptPath);
  }

  /**
   * Determina o comando para executar o script baseado na extensão
   */
  private getCommandForScript(scriptPath: string): string {
    const ext = scriptPath.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'bat':
      case 'cmd':
        return scriptPath; // Arquivos .bat podem ser executados diretamente
      case 'js':
        return 'node';
      case 'ts':
        return 'tsx';
      case 'py':
        return 'python';
      case 'sh':
        return 'bash';
      case 'ps1':
        return 'powershell';
      default:
        // Tentar executar diretamente
        return scriptPath;
    }
  }

  /**
   * Lista todos os scripts mapeados disponíveis
   */
  listarScriptsDisponiveis(): Array<{ nome: string; arquivo: string; descricao: string }> {
    return [
      {
        nome: 'iniciar_dev',
        arquivo: 'BOTAO_1_INICIAR_DEV.bat',
        descricao: 'Inicia ambiente de desenvolvimento',
      },
      {
        nome: 'testar_saude',
        arquivo: 'BOTAO_2_TESTAR_SAUDE.bat',
        descricao: 'Testa saúde do sistema',
      },
      {
        nome: 'backup_db',
        arquivo: 'BOTAO_3_BACKUP_DB_DEV.bat',
        descricao: 'Faz backup do banco de dados',
      },
      {
        nome: 'commit_push',
        arquivo: 'BOTAO_4_COMMIT_PUSH.bat',
        descricao: 'Faz commit e push das alterações',
      },
    ];
  }

  /**
   * Cancela um processo em execução
   */
  cancelarProcesso(processId: string): boolean {
    const process = this.activeProcesses.get(processId);
    if (process) {
      process.kill('SIGTERM');
      this.activeProcesses.delete(processId);
      return true;
    }
    return false;
  }

  /**
   * Lista processos ativos
   */
  listarProcessosAtivos(): Array<{ id: string; command: string; startTime: Date }> {
    return Array.from(this.activeProcesses.entries()).map(([id, process]) => ({
      id,
      command: process.spawnargs?.join(' ') || 'Unknown',
      startTime: new Date(), // Isso poderia ser armazenado no futuro
    }));
  }

  /**
   * Move o mouse para uma posição específica (via sandbox)
   */
  async moveMouse(x: number, y: number): Promise<ActionResult> {
    try {
      const action: DesktopAction = {
        type: 'mouse_action',
        target: 'move',
        parameters: { x, y }
      };

      const result = await leoDesktopSandbox.executeAction(action);
      
      if (result.success) {
        console.log(`[LeoComputerControl] Mouse movido para (${x}, ${y}) via sandbox`);
      }
      
      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao mover mouse:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao mover mouse',
      };
    }
  }

  /**
   * Clica com o botão esquerdo do mouse (via sandbox)
   */
  async clickLeft(): Promise<ActionResult> {
    try {
      const action: DesktopAction = {
        type: 'mouse_action',
        target: 'click'
      };

      const result = await leoDesktopSandbox.executeAction(action);
      
      if (result.success) {
        console.log('[LeoComputerControl] Clique esquerdo executado via sandbox');
      }
      
      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao clicar:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao clicar',
      };
    }
  }

  /**
   * Clica com o botão direito do mouse (via sandbox)
   */
  async clickRight(): Promise<{ success: boolean; message: string }> {
    try {
      const action: DesktopAction = {
        type: 'mouse_action',
        target: 'right_click'
      };

      const result = await leoDesktopSandbox.executeAction(action);
      
      if (result.success) {
        console.log('[LeoComputerControl] Clique direito executado via sandbox');
      }
      
      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao clicar:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao clicar',
      };
    }
  }

  /**
   * Executa duplo clique (via sandbox)
   */
  async doubleClick(): Promise<ActionResult> {
    try {
      const action: DesktopAction = {
        type: 'mouse_action',
        target: 'double_click'
      };

      const result = await leoDesktopSandbox.executeAction(action);
      
      if (result.success) {
        console.log('[LeoComputerControl] Duplo clique executado via sandbox');
      }
      
      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao executar duplo clique:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao executar duplo clique',
      };
    }
  }

  /**
   * Rola o mouse (via sandbox)
   */
  async scrollMouse(amount: number): Promise<ActionResult> {
    try {
      const action: DesktopAction = {
        type: 'mouse_action',
        target: 'scroll',
        parameters: { amount }
      };

      const result = await leoDesktopSandbox.executeAction(action);
      
      if (result.success) {
        console.log(`[LeoComputerControl] Mouse rolado: ${amount} pixels via sandbox`);
      }
      
      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao rolar mouse:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao rolar mouse',
      };
    }
  }

  /**
   * Digita texto (via sandbox)
   */
  async typeText(text: string): Promise<ActionResult> {
    try {
      const action: DesktopAction = {
        type: 'keyboard_action',
        target: 'type',
        parameters: { text }
      };

      const result = await leoDesktopSandbox.executeAction(action);
      
      if (result.success) {
        console.log(`[LeoComputerControl] Texto digitado: "${text}" via sandbox`);
      }
      
      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao digitar texto:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao digitar texto',
      };
    }
  }

  /**
   * Pressiona uma tecla (via sandbox)
   */
  async pressKey(key: string): Promise<ActionResult> {
    try {
      const action: DesktopAction = {
        type: 'keyboard_action',
        target: 'press',
        parameters: { key }
      };

      const result = await leoDesktopSandbox.executeAction(action);
      
      if (result.success) {
        console.log(`[LeoComputerControl] Tecla pressionada: ${key} via sandbox`);
      }
      
      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao pressionar tecla:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao pressionar tecla',
      };
    }
  }

  /**
   * Pressiona combinação de teclas (via sandbox)
   */
  async pressKeyCombo(keys: string[]): Promise<ActionResult> {
    try {
      const action: DesktopAction = {
        type: 'keyboard_action',
        target: 'combo',
        parameters: { keys }
      };

      const result = await leoDesktopSandbox.executeAction(action);
      
      if (result.success) {
        console.log(`[LeoComputerControl] Combo pressionado: ${keys.join(' + ')} via sandbox`);
      }
      
      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao pressionar combo:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao pressionar combo',
      };
    }
  }

  /**
   * Abre um programa
   */
  async openProgram(path: string): Promise<ScriptResult> {
    const startTime = Date.now();
    
    try {
      console.log(`[LeoComputerControl] Abrindo programa: ${path}`);
      
      // No Windows, usar 'start' para abrir programas
      const command = process.platform === 'win32' ? 'start' : 'xdg-open';
      const { stdout, stderr } = await execAsync(`${command} "${path}"`);
      
      const executionTime = Date.now() - startTime;
      
      console.log(`[LeoComputerControl] Programa aberto em ${executionTime}ms`);
      
      return {
        success: true,
        stdout: `Programa aberto: ${path}`,
        stderr: '',
        exitCode: 0,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('[LeoComputerControl] Erro ao abrir programa:', error);
      
      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Erro ao abrir programa',
        exitCode: 1,
        executionTime,
      };
    }
  }

  /**
   * Registra log das ações
   */
  private async logAction(
    usuario: string,
    acao: string,
    alvo: string,
    dados: Record<string, unknown>
  ): Promise<void> {
    try {
      await insertLeoActionLog({
        usuario,
        acao,
        entidade: 'leo_computer_control',
        dados: JSON.stringify({
          acao,
          alvo,
          ...dados,
        }),
        resultado: dados.success ? 'SUCESSO' : 'ERRO',
      });
    } catch (error) {
      console.error('[LeoComputerControl] Erro ao registrar log:', error);
    }
  }
}

// Exportar instância singleton
export const leoComputerControl = LeoComputerControl.getInstance();
