import { z } from 'zod';
import { desktopController } from '../desktop/desktop-controller.js';
import { getLeoToolDefinitions } from '../tools/index.js';
// Registry de ferramentas
class ToolRegistry {
    tools = new Map();
    constructor() {
        this.registerTools();
    }
    async getRobot() {
        return { status: "no_robot", available: false };
    }
    registerTools() {
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
                const i = payload;
                return (await desktopController.openApp(i.appName, i.parameters));
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
                const i = payload;
                return (await desktopController.closeApp(i.appName, i.force));
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
                const i = payload;
                return (await desktopController.openBrowser(i.url, i.incognito));
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
                const i = payload;
                return (await desktopController.navigateUrl(i.url, i.tabId));
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
                const i = payload;
                return (await desktopController.readFile(i.filePath, i.encoding));
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
                const i = payload;
                return (await desktopController.writeFile(i.filePath, i.content, i.append));
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
                const i = payload;
                return (await desktopController.runTerminalCommand(i.command, i.workingDirectory, i.timeout));
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
                const i = payload;
                return (await desktopController.takeScreenshot(i.region, i.windowTitle, i.savePath));
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
                const i = payload;
                return (await desktopController.getSystemStatus(i.category ?? 'all'));
            }
        });
        this.register({
            name: 'cpu_usage',
            description: 'Obtém uso atual da CPU',
            inputSchema: z.object({}),
            handler: async (payload, ctx) => {
                return (await desktopController.getCpuUsage());
            }
        });
        this.register({
            name: 'memory_usage',
            description: 'Obtém uso atual da memória',
            inputSchema: z.object({}),
            handler: async (payload, ctx) => {
                return (await desktopController.getMemoryUsage());
            }
        });
        this.register({
            name: 'running_apps',
            description: 'Lista aplicativos em execução',
            inputSchema: z.object({
                filter: z.string().optional().describe('Filtro por nome de aplicativo')
            }),
            handler: async (payload, ctx) => {
                const i = payload;
                return (await desktopController.getRunningApps(i.filter));
            }
        });
        this.registerLeoTools();
    }
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    /** Regista todas as tools modulares de server/leo/tools (clientes, pedidos, financeiro, estoque). */
    registerLeoTools() {
        getLeoToolDefinitions().forEach((def) => this.register(def));
    }
    getTool(name) {
        return this.tools.get(name);
    }
    getAllTools() {
        return Array.from(this.tools.values());
    }
    getToolNames() {
        return Array.from(this.tools.keys());
    }
    // Gera schema para o modelo de AI
    getToolsSchema() {
        return this.getAllTools().map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: this.zodSchemaToJsonSchema(tool.inputSchema)
        }));
    }
    zodSchemaToJsonSchema(schema) {
        const jsonSchema = {
            type: "object",
            properties: {},
            required: []
        };
        if (schema instanceof z.ZodObject) {
            const shape = schema.shape;
            const properties = jsonSchema.properties;
            for (const [key, value] of Object.entries(shape)) {
                const zodField = value;
                properties[key] = this.zodTypeToJsonSchema(zodField);
                if (!zodField.isOptional()) {
                    jsonSchema.required.push(key);
                }
            }
        }
        return jsonSchema;
    }
    zodTypeToJsonSchema(zodType) {
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
            return this.zodTypeToJsonSchema(zodType.unwrap());
        }
        if (zodType instanceof z.ZodDefault) {
            return this.zodTypeToJsonSchema(zodType.removeDefault());
        }
        return { type: "string" };
    }
}
// Export singleton
export const toolRegistry = new ToolRegistry();
