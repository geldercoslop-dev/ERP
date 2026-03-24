import { z } from 'zod';
import { desktopController } from '../desktop/desktop-controller';
import { getLeoToolDefinitions } from '../tools';
import type { Payload } from '../../../shared/types';
import type { SecureToolContext } from '../../_core/secure-context';

/** Contexto obrigatório em todo handler de tool (alinhado ao executor LEO). */
export type ToolContext = SecureToolContext;
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: Payload, context: ToolContext) => Promise<Payload>;
}

// Registry de ferramentas
class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  constructor() {
    this.registerTools();
  }

  private async getRobot(): Promise<Payload> {
    return {};
  }

  private registerTools() {
    // ERP: apenas tools modulares em server/leo/tools (getLeoToolDefinitions no final).

    // === DESKTOP TOOLS ===
    
    this.register({
      name: 'open_app',
      description: 'Abre um aplicativo no desktop',
      inputSchema: z.object({
        appName: z.string().describe('Nome do aplicativo a ser aberto'),
        parameters: z.record(z.string(), z.unknown()).optional().describe('Parâmetros opcionais para o aplicativo')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { appName: string; parameters?: Record<string, unknown> };
        return (await desktopController.openApp(i.appName, i.parameters)) as unknown as Payload;
      }
    });

    this.register({
      name: 'close_app',
      description: 'Fecha um aplicativo no desktop',
      inputSchema: z.object({
        appName: z.string().describe('Nome do aplicativo a ser fechado'),
        force: z.boolean().optional().default(false).describe('Forçar fechamento')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { appName: string; force?: boolean };
        return (await desktopController.closeApp(i.appName, i.force)) as unknown as Payload;
      }
    });

    this.register({
      name: 'open_browser',
      description: 'Abre o navegador com uma URL específica',
      inputSchema: z.object({
        url: z.string().url().describe('URL a ser aberta'),
        incognito: z.boolean().optional().default(false).describe('Abrir em modo anônimo')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { url: string; incognito?: boolean };
        return (await desktopController.openBrowser(i.url, i.incognito)) as unknown as Payload;
      }
    });

    this.register({
      name: 'navigate_url',
      description: 'Navega para uma URL no navegador atual',
      inputSchema: z.object({
        url: z.string().url().describe('URL para navegar'),
        tabId: z.number().optional().describe('ID da aba (opcional)')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { url: string; tabId?: number };
        return (await desktopController.navigateUrl(i.url, i.tabId)) as unknown as Payload;
      }
    });

    this.register({
      name: 'read_file',
      description: 'Lê o conteúdo de um arquivo de forma segura',
      inputSchema: z.object({
        filePath: z.string().describe('Caminho do arquivo a ser lido'),
        encoding: z.string().optional().default('utf-8').describe('Codificação do arquivo')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { filePath: string; encoding?: string };
        return (await desktopController.readFile(i.filePath, i.encoding)) as unknown as Payload;
      }
    });

    this.register({
      name: 'write_file',
      description: 'Escreve conteúdo em um arquivo de forma segura',
      inputSchema: z.object({
        filePath: z.string().describe('Caminho do arquivo'),
        content: z.string().describe('Conteúdo a ser escrito'),
        append: z.boolean().optional().default(false).describe('Anexar ao final do arquivo')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { filePath: string; content: string; append?: boolean };
        return (await desktopController.writeFile(i.filePath, i.content, i.append)) as unknown as Payload;
      }
    });

    this.register({
      name: 'run_terminal_command',
      description: 'Executa um comando no terminal com validação de segurança',
      inputSchema: z.object({
        command: z.string().describe('Comando a ser executado'),
        workingDirectory: z.string().optional().describe('Diretório de trabalho'),
        timeout: z.number().optional().default(30000).describe('Timeout em milissegundos')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { command: string; workingDirectory?: string; timeout?: number };
        return (await desktopController.runTerminalCommand(i.command, i.workingDirectory, i.timeout)) as unknown as Payload;
      }
    });

    this.register({
      name: 'take_screenshot',
      description: 'Captura uma screenshot da tela ou janela específica',
      inputSchema: z.object({
        region: z.string().optional().describe('Região: "full", "window", "area"'),
        windowTitle: z.string().optional().describe('Título da janela para captura específica'),
        savePath: z.string().optional().describe('Caminho para salvar a imagem')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { region?: string; windowTitle?: string; savePath?: string };
        return (await desktopController.takeScreenshot(i.region, i.windowTitle, i.savePath)) as unknown as Payload;
      }
    });

    // === SYSTEM TOOLS ===
    
    this.register({
      name: 'system_status',
      description: 'Obtém informações detalhadas do sistema',
      inputSchema: z.object({
        category: z.enum(['cpu', 'memory', 'disk', 'network', 'all']).default('all').describe('Categoria de informações')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { category?: string };
        return (await desktopController.getSystemStatus(i.category ?? 'all')) as unknown as Payload;
      }
    });

    this.register({
      name: 'cpu_usage',
      description: 'Obtém uso atual da CPU',
      inputSchema: z.object({}),
      handler: async (payload, ctx) => {
        return (await desktopController.getCpuUsage()) as unknown as Payload;
      }
    });

    this.register({
      name: 'memory_usage',
      description: 'Obtém uso atual da memória',
      inputSchema: z.object({}),
      handler: async (payload, ctx) => {
        return (await desktopController.getMemoryUsage()) as unknown as Payload;
      }
    });

    this.register({
      name: 'running_apps',
      description: 'Lista aplicativos em execução',
      inputSchema: z.object({
        filter: z.string().optional().describe('Filtro por nome de aplicativo')
      }),
      handler: async (payload, ctx) => {
        const i = payload as { filter?: string };
        return (await desktopController.getRunningApps(i.filter)) as unknown as Payload;
      }
    });

    this.registerLeoTools();
  }

  public register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  /** Regista todas as tools modulares de server/leo/tools (clientes, pedidos, financeiro, estoque). */
  private registerLeoTools() {
    getLeoToolDefinitions().forEach((def) => this.register(def));
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  // Gera schema para o modelo de AI
  getToolsSchema(): Record<string, unknown>[] {
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.zodSchemaToJsonSchema(tool.inputSchema)
    }));
  }

  private zodSchemaToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
    const jsonSchema: Record<string, unknown> = {
      type: "object",
      properties: {},
      required: []
    };

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties = jsonSchema.properties as Record<string, unknown>;
      
      for (const [key, value] of Object.entries(shape)) {
        const zodField = value as z.ZodTypeAny;
        properties[key] = this.zodTypeToJsonSchema(zodField);
        
        if (!zodField.isOptional()) {
          (jsonSchema.required as string[]).push(key);
        }
      }
    }

    return jsonSchema;
  }

  private zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
    if (zodType instanceof z.ZodString) {
      return { type: "string" };
    }
    if (zodType instanceof z.ZodNumber) {
      return { type: "number" };
    }
    if (zodType instanceof z.ZodBoolean) {
      return { type: "boolean" };
    }
    if (zodType instanceof z.ZodOptional) {
      return this.zodTypeToJsonSchema(zodType.unwrap() as z.ZodTypeAny);
    }
    if (zodType instanceof z.ZodDefault) {
      return this.zodTypeToJsonSchema(zodType.removeDefault() as z.ZodTypeAny);
    }
    return { type: "string" };
  }
}

// Export singleton
export const toolRegistry = new ToolRegistry();
