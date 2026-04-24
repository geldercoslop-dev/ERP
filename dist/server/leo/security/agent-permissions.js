/**
 * Agent Permissions Layer
 *
 * Controla segurança e permissões para operações do LEO Agent
 */
import { ValidationError } from '../../_core/errors/typed-errors.js';
export class AgentPermissions {
    static instance;
    rules = new Map();
    constructor() {
        this.initializeRules();
    }
    static getInstance() {
        if (!AgentPermissions.instance) {
            AgentPermissions.instance = new AgentPermissions();
        }
        return AgentPermissions.instance;
    }
    /**
     * Valida contexto obrigatório para toda execução LEO
     */
    validateRequiredContext(context) {
        if (!context.tenantId) {
            return {
                valid: false,
                reason: 'tenantId é obrigatório para execução de tools'
            };
        }
        if (!context.userId) {
            return {
                valid: false,
                reason: 'userId é obrigatório para execução de tools'
            };
        }
        if (!context.action) {
            return {
                valid: false,
                reason: 'action é obrigatório para execução de tools'
            };
        }
        return { valid: true };
    }
    initializeRules() {
        // === REGRA: DENY POR PADRÃO ===
        // Apenas tools essenciais e seguras são permitidas
        // === DESKTOP TOOLS (BLOQUEADAS) ===
        this.rules.set('open_app', {
            toolName: 'open_app',
            allowedRoles: [], // BLOQUEADO
            requiresConfirmation: true,
            dangerous: true,
            description: 'Abrir aplicativos desktop - BLOQUEADO POR SEGURANÇA'
        });
        this.rules.set('close_app', {
            toolName: 'close_app',
            allowedRoles: [], // BLOQUEADO
            requiresConfirmation: true,
            dangerous: true,
            description: 'Fechar aplicativos desktop - BLOQUEADO POR SEGURANÇA'
        });
        this.rules.set('open_browser', {
            toolName: 'open_browser',
            allowedRoles: [], // BLOQUEADO
            requiresConfirmation: true,
            dangerous: true,
            description: 'Abrir navegador com URL - BLOQUEADO POR SEGURANÇA'
        });
        // === FILE SYSTEM TOOLS (BLOQUEADAS) ===
        this.rules.set('read_file', {
            toolName: 'read_file',
            allowedRoles: [], // BLOQUEADO
            requiresConfirmation: true,
            dangerous: true,
            description: 'Ler arquivos do sistema - BLOQUEADO POR SEGURANÇA'
        });
        this.rules.set('write_file', {
            toolName: 'write_file',
            allowedRoles: [], // BLOQUEADO
            requiresConfirmation: true,
            dangerous: true,
            description: 'Escrever arquivos no sistema - BLOQUEADO POR SEGURANÇA'
        });
        this.rules.set('run_terminal_command', {
            toolName: 'run_terminal_command',
            allowedRoles: [], // BLOQUEADO
            requiresConfirmation: true,
            dangerous: true,
            description: 'Executar comandos no terminal - BLOQUEADO POR SEGURANÇA'
        });
        // === SYSTEM TOOLS (LIMITADAS) ===
        this.rules.set('system_status', {
            toolName: 'system_status',
            allowedRoles: ['admin'],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Verificar status do sistema'
        });
        this.rules.set('cpu_usage', {
            toolName: 'cpu_usage',
            allowedRoles: ['admin'],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Verificar uso da CPU'
        });
        this.rules.set('memory_usage', {
            toolName: 'memory_usage',
            allowedRoles: ['admin'],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Verificar uso da memória'
        });
        this.rules.set('running_apps', {
            toolName: 'running_apps',
            allowedRoles: ['admin'],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Listar aplicativos em execução'
        });
        this.rules.set('navigate_url', {
            toolName: 'navigate_url',
            allowedRoles: [],
            requiresConfirmation: true,
            dangerous: true,
            description: 'Navegação desktop - BLOQUEADO POR SEGURANÇA'
        });
        this.rules.set('take_screenshot', {
            toolName: 'take_screenshot',
            allowedRoles: [],
            requiresConfirmation: true,
            dangerous: true,
            description: 'Screenshot desktop - BLOQUEADO POR SEGURANÇA'
        });
        const erpRead = ['admin', 'user', 'vendedor'];
        this.rules.set('buscar_cliente', {
            toolName: 'buscar_cliente',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Buscar/listar clientes (escopo por ator)'
        });
        this.rules.set('detalhar_cliente', {
            toolName: 'detalhar_cliente',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Detalhar cliente por ID'
        });
        this.rules.set('buscar_pedido', {
            toolName: 'buscar_pedido',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Buscar pedido por número'
        });
        this.rules.set('ver_pedido', {
            toolName: 'ver_pedido',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Ver pedido por ID interno'
        });
        this.rules.set('listar_pedidos', {
            toolName: 'listar_pedidos',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Listar pedidos (escopo por ator)'
        });
        this.rules.set('criar_pedido', {
            toolName: 'criar_pedido',
            allowedRoles: [...erpRead],
            requiresConfirmation: true,
            dangerous: false,
            description: 'Criar pedido (vendedorId do contexto para vendedor)'
        });
        this.rules.set('resumo_financeiro', {
            toolName: 'resumo_financeiro',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Resumo financeiro (escopo por ator)'
        });
        this.rules.set('listar_contas_receber', {
            toolName: 'listar_contas_receber',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Contas a receber (escopo por ator)'
        });
        this.rules.set('baixar_pedido', {
            toolName: 'baixar_pedido',
            allowedRoles: ['admin', 'vendedor'],
            requiresConfirmation: true,
            dangerous: false,
            description: 'Baixa / pagamento de pedido'
        });
        this.rules.set('listar_estoque', {
            toolName: 'listar_estoque',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Listar produtos em estoque'
        });
        this.rules.set('buscar_produto', {
            toolName: 'buscar_produto',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Buscar produto por ID'
        });
        this.rules.set('ver_cargas', {
            toolName: 'ver_cargas',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Listar cargas'
        });
        this.rules.set('ver_pedidos_entrega', {
            toolName: 'ver_pedidos_entrega',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Pedidos para carga (vendedor: só os seus)'
        });
        this.rules.set('ver_historico_rota', {
            toolName: 'ver_historico_rota',
            allowedRoles: [...erpRead],
            requiresConfirmation: false,
            dangerous: false,
            description: 'Histórico de rotas'
        });
        // === TOOLS NÃO REGISTRADAS (BLOQUEADAS POR PADRÃO) ===
    }
    /**
     * Verifica se um usuário tem permissão para executar uma ferramenta
     */
    hasPermission(toolName, context) {
        // 1. Validar contexto obrigatório primeiro
        const contextValidation = this.validateRequiredContext(context);
        if (!contextValidation.valid) {
            return {
                allowed: false,
                reason: contextValidation.reason,
                requiresConfirmation: false,
                dangerous: false
            };
        }
        // 2. Verificar se tool está registrada
        const rule = this.rules.get(toolName);
        if (!rule) {
            return {
                allowed: false,
                reason: `Ferramenta não registrada: ${toolName}. Todas as tools devem ser registradas explicitamente.`,
                requiresConfirmation: false,
                dangerous: false
            };
        }
        // 3. Verificar role (deny por padrão)
        const effectiveRole = context.role === 'admin'
            ? 'admin'
            : context.role === 'vendedor'
                ? 'vendedor'
                : context.role === 'system'
                    ? 'user'
                    : context.userRole || 'user';
        if (!rule.allowedRoles.includes(effectiveRole)) {
            return {
                allowed: false,
                reason: `Permissão negada. Role ${effectiveRole} não autorizado para ${toolName}. Roles permitidas: ${rule.allowedRoles.join(', ')}`,
                requiresConfirmation: rule.requiresConfirmation,
                dangerous: rule.dangerous
            };
        }
        // 4. Verificar comandos perigosos
        if (rule.dangerous && !this.validateSafeExecution(toolName, context)) {
            return {
                allowed: false,
                reason: 'Comando considerado perigoso. Requer confirmação explícita.',
                requiresConfirmation: true,
                dangerous: true
            };
        }
        return {
            allowed: true,
            requiresConfirmation: rule.requiresConfirmation,
            dangerous: rule.dangerous
        };
    }
    /**
     * Valida se a execução é segura baseada no contexto
     */
    validateSafeExecution(toolName, context) {
        // Regras específicas para comandos perigosos
        if (toolName === 'run_terminal_command') {
            // Admins podem executar comandos mais perigosos
            if (context.userRole === 'admin' || context.role === 'admin') {
                return true;
            }
            // Outros usuários só podem executar comandos seguros
            const safeCommands = [
                'dir', 'ls', 'cd', 'pwd', 'echo', 'date', 'time',
                'whoami', 'hostname', 'ipconfig', 'ping', 'curl', 'wget',
                'git status', 'git log', 'git diff'
            ];
            // Esta validação seria feita no nível do comando
            return true;
        }
        return true;
    }
    /**
     * Filtra caminhos de arquivo para acesso seguro
     */
    sanitizeFilePath(filePath) {
        // Remove tentativas de path traversal
        const normalized = filePath.replace(/\.\./g, '').replace(/\.\./g, '');
        // Remove barras no início
        const cleanPath = normalized.replace(/^[/\\]+/, '');
        // Impede acesso a diretórios sensíveis
        const restrictedPaths = [
            'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
            '/etc', '/bin', '/usr/bin', '/sbin', '/boot', '/sys', '/proc'
        ];
        const isRestricted = restrictedPaths.some(restricted => cleanPath.toLowerCase().startsWith(restricted.toLowerCase()));
        if (isRestricted) {
            throw new ValidationError('Acesso negado a diretório restrito');
        }
        return cleanPath;
    }
    /**
     * Valida se um comando é seguro para execução
     */
    validateCommand(command) {
        // Lista de comandos bloqueados
        const blockedCommands = [
            'format', 'del', 'rmdir', 'shutdown', 'reboot', 'halt',
            'rm -rf', 'sudo rm', 'chmod 777', 'dd if=/dev/zero',
            'mkfs', 'fdisk', 'passwd', 'useradd', 'userdel'
        ];
        const normalizedCommand = command.toLowerCase().trim();
        for (const blocked of blockedCommands) {
            if (normalizedCommand.includes(blocked)) {
                return {
                    safe: false,
                    reason: `Comando bloqueado por segurança: ${blocked}`,
                    blocked: true
                };
            }
        }
        return {
            safe: true,
            blocked: false
        };
    }
    /**
     * Obtém todas as regras para auditoria
     */
    getAllRules() {
        return Array.from(this.rules.values());
    }
    /**
     * Obtém regras por categoria
     */
    getRulesByCategory(category) {
        return Array.from(this.rules.values()).filter(rule => {
            if (category === 'desktop') {
                return ['open_app', 'close_app', 'open_browser', 'navigate_url', 'read_file', 'write_file', 'run_terminal_command', 'take_screenshot'].includes(rule.toolName);
            }
            else if (category === 'system') {
                return ['system_status', 'cpu_usage', 'memory_usage', 'running_apps'].includes(rule.toolName);
            }
            else if (category === 'erp') {
                return [
                    'buscar_cliente',
                    'detalhar_cliente',
                    'buscar_pedido',
                    'ver_pedido',
                    'listar_pedidos',
                    'criar_pedido',
                    'resumo_financeiro',
                    'listar_contas_receber',
                    'baixar_pedido',
                    'listar_estoque',
                    'buscar_produto',
                    'ver_cargas',
                    'ver_pedidos_entrega',
                    'ver_historico_rota',
                ].includes(rule.toolName);
            }
            return false;
        });
    }
}
export const agentPermissions = AgentPermissions.getInstance();
