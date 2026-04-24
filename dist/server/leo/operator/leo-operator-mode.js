/**
 * Modo Operador do LEO
 *
 * Quando ativo, Leo pode operar o ERP e o computador completamente
 */
import { leoEngine } from '../engine/leo-engine.js';
import { leoAutomation } from '../actions/leo-automation.js';
import { leoSystemMonitor } from '../perception/leo-system-monitor.js';
import { leoEvents } from '../memory/leo-events.js';
import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
export const LEO_OPERATOR_MODE = 'LEO_OPERATOR_MODE';
/**
 * Classe para gerenciar o modo operador do Leo
 */
export class LeoOperatorMode {
    static instance;
    config;
    startTime;
    constructor() {
        this.config = {
            ativo: false,
            modoOperacao: 'assistido',
            nivelAutonomia: 'media',
            permissoes: {
                operarErp: true,
                controlarComputador: true,
                capturarTela: true,
                executarOcr: true,
                monitorarSistema: true,
                executarAutomacoes: true,
                gerenciarEventos: true,
            },
            restricoes: {
                requiresConfirmation: false,
                allowedCommands: [],
                blockedActions: [],
                maxExecutionTime: 30,
            },
        };
    }
    static getInstance() {
        if (!LeoOperatorMode.instance) {
            LeoOperatorMode.instance = new LeoOperatorMode();
        }
        return LeoOperatorMode.instance;
    }
    /**
     * Define o modo de operação (manual, assistido, autônomo)
     */
    async setModoOperacao(modo) {
        try {
            const modoAnterior = this.config.modoOperacao;
            this.config.modoOperacao = modo;
            // Ajustar configurações baseadas no modo
            switch (modo) {
                case 'manual':
                    this.config.nivelAutonomia = 'baixa';
                    this.config.restricoes.requiresConfirmation = true;
                    this.config.restricoes.maxExecutionTime = 15;
                    break;
                case 'assistido':
                    this.config.nivelAutonomia = 'media';
                    this.config.restricoes.requiresConfirmation = true;
                    this.config.restricoes.maxExecutionTime = 30;
                    break;
                case 'autonomo':
                    this.config.nivelAutonomia = 'alta';
                    this.config.restricoes.requiresConfirmation = false;
                    this.config.restricoes.maxExecutionTime = 60;
                    break;
            }
            await this.logAction('mudar_modo_operacao', `Modo alterado: ${modoAnterior} → ${modo}`, {
                modoAnterior,
                novoModo: modo,
                configuracoes: this.config,
            });
            console.log(`[LeoOperatorMode] Modo de operação alterado para: ${modo}`);
            return {
                success: true,
                message: `Modo de operação alterado para ${modo}`,
            };
        }
        catch (error) {
            console.error('[LeoOperatorMode] Erro ao alterar modo de operação:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao alterar modo de operação',
            };
        }
    }
    /**
     * Obtém o modo de operação atual
     */
    getModoOperacao() {
        return this.config.modoOperacao;
    }
    /**
     * Verifica se uma ação é permitida no modo atual
     */
    isAcaoPermitidaNoModo(acao) {
        switch (this.config.modoOperacao) {
            case 'manual':
                // No modo manual, apenas ações básicas são permitidas
                const acoesBasicas = ['consultar_', 'verificar_', 'obter_'];
                return acoesBasicas.some(prefix => acao.startsWith(prefix));
            case 'assistido':
                // No modo assistido, ações básicas e algumas operações são permitidas
                const acoesPermitidas = ['consultar_', 'verificar_', 'obter_', 'ajustar_', 'criar_'];
                return acoesPermitidas.some(prefix => acao.startsWith(prefix));
            case 'autonomo':
                // No modo autônomo, todas as ações são permitidas
                return true;
            default:
                return false;
        }
    }
    /**
     * Ativa o modo operador
     */
    async ativarModoOperador(config) {
        try {
            console.log('[LeoOperatorMode] Ativando modo operador');
            // Mesclar configuração personalizada
            if (config) {
                this.config = {
                    ...this.config,
                    ...config,
                    permissoes: {
                        ...this.config.permissoes,
                        ...config.permissoes,
                    },
                    restricoes: {
                        ...this.config.restricoes,
                        ...config.restricoes,
                    },
                };
            }
            // Verificar capacidades
            const capabilities = await leoEngine.getCapabilities();
            const caps = capabilities;
            const missingCapabilities = [];
            if (this.config.permissoes.controlarComputador && !caps.computer_control) {
                missingCapabilities.push('Controle de computador (robotjs)');
            }
            if (this.config.permissoes.capturarTela && !caps.screen_reading) {
                missingCapabilities.push('Captura de tela (screenshot-desktop)');
            }
            if (this.config.permissoes.executarOcr && !caps.ocr_analysis) {
                missingCapabilities.push('OCR (tesseract.js)');
            }
            if (this.config.permissoes.monitorarSistema && !caps.system_monitor) {
                missingCapabilities.push('Monitoramento do sistema');
            }
            if (missingCapabilities.length > 0) {
                return {
                    success: false,
                    message: `Modo operador não pode ser ativado. Capacidades faltando: ${missingCapabilities.join(', ')}`,
                };
            }
            // Ativar modo
            this.config.ativo = true;
            this.startTime = new Date();
            // Iniciar sistemas automáticos conforme configuração
            if (this.config.permissoes.monitorarSistema) {
                await leoSystemMonitor.iniciarMonitoramento(60000); // 1 minuto
            }
            if (this.config.permissoes.executarAutomacoes) {
                await leoAutomation.iniciarAutomacao();
            }
            // Registrar ativação
            await this.logAction('ativar_modo_operador', 'Modo operador ativado', {
                nivelAutonomia: this.config.nivelAutonomia,
                permissoes: this.config.permissoes,
                restricoes: this.config.restricoes,
            });
            console.log('[LeoOperatorMode] Modo operador ativado com sucesso');
            console.log(`[LeoOperatorMode] Nível de autonomia: ${this.config.nivelAutonomia}`);
            return {
                success: true,
                message: `Modo operador ativado (nível: ${this.config.nivelAutonomia})`,
            };
        }
        catch (error) {
            console.error('[LeoOperatorMode] Erro ao ativar modo operador:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao ativar modo operador',
            };
        }
    }
    /**
     * Desativa o modo operador
     */
    async desativarModoOperador() {
        try {
            console.log('[LeoOperatorMode] Desativando modo operador');
            if (!this.config.ativo) {
                return {
                    success: false,
                    message: 'Modo operador já está inativo',
                };
            }
            // Parar sistemas automáticos
            await leoSystemMonitor.pararMonitoramento();
            await leoAutomation.pararAutomacao();
            // Desativar modo
            this.config.ativo = false;
            const executionTime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
            // Registrar desativação
            await this.logAction('desativar_modo_operador', 'Modo operador desativado', {
                executionTime,
            });
            console.log('[LeoOperatorMode] Modo operador desativado');
            return {
                success: true,
                message: 'Modo operador desativado',
            };
        }
        catch (error) {
            console.error('[LeoOperatorMode] Erro ao desativar modo operador:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao desativar modo operador',
            };
        }
    }
    /**
     * Verifica se o modo operador está ativo
     */
    isModoOperadorAtivo() {
        return this.config.ativo;
    }
    /**
     * Obtém configuração atual
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Atualiza configuração do modo
     */
    async atualizarConfig(config) {
        try {
            const wasActive = this.config.ativo;
            // Atualizar configuração
            this.config = {
                ...this.config,
                ...config,
                permissoes: {
                    ...this.config.permissoes,
                    ...config.permissoes,
                },
                restricoes: {
                    ...this.config.restricoes,
                    ...config.restricoes,
                },
            };
            // Se estava ativo, reativar com nova configuração
            if (wasActive) {
                await this.desativarModoOperador();
                return await this.ativarModoOperador();
            }
            return {
                success: true,
                message: 'Configuração atualizada',
            };
        }
        catch (error) {
            console.error('[LeoOperatorMode] Erro ao atualizar configuração:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao atualizar configuração',
            };
        }
    }
    /**
     * Executa uma ação no modo operador
     */
    async executarAcao(acao, parametros) {
        // Verificar restrições
        if (this.config.restricoes.requiresConfirmation) {
            console.log(`[LeoOperatorMode] Ação requer confirmação: ${acao}`);
            // Em um ambiente real, aqui seria solicitada confirmação ao usuário
        }
        // Executar ação baseada no tipo
        let resultado;
        switch (acao) {
            case 'operar_erp':
                resultado = await this.operarERP(parametros);
                break;
            case 'controlar_computador':
                resultado = await this.controlarComputador(parametros);
                break;
            case 'capturar_tela':
                resultado = await this.capturarTela(parametros);
                break;
            case 'executar_ocr':
                resultado = await this.executarOCR(parametros);
                break;
            case 'monitorar_sistema':
                resultado = await this.monitorarSistema(parametros);
                break;
            case 'executar_automacao':
                resultado = await this.executarAutomacao(parametros);
                break;
            case 'gerenciar_eventos':
                resultado = await this.gerenciarEventos(parametros);
                break;
            default:
                resultado = await this.executarAcaoGenerica(acao, parametros);
                break;
        }
        // Registrar ação
        await this.logAction(acao, `Ação executada: ${acao}`, {
            parametros,
            resultado,
            nivelAutonomia: this.config.nivelAutonomia,
        });
        return resultado;
    }
    /**
     * Executa ação genérica
     */
    async executarAcaoGenerica(_acao, _parametros) {
        return { success: false, message: 'Não implementado' };
    }
    /**
     * Operar ERP
     */
    async operarERP(_parametros) {
        return { success: false, message: 'Não implementado' };
    }
    /**
     * Controlar computador
     */
    async controlarComputador(_parametros) {
        return { success: false, message: 'Não implementado' };
    }
    /**
     * Capturar tela
     */
    async capturarTela(_parametros) {
        return { success: false, message: 'Não implementado' };
    }
    /**
     * Executar OCR
     */
    async executarOCR(_parametros) {
        return { success: false, message: 'Não implementado' };
    }
    /**
     * Monitorar sistema
     */
    async monitorarSistema(_parametros) {
        return { success: false, message: 'Não implementado' };
    }
    /**
     * Executar automação
     */
    async executarAutomacao(_parametros) {
        return { success: false, message: 'Não implementado' };
    }
    /**
     * Gerenciar eventos
     */
    async gerenciarEventos(_parametros) {
        return { success: false, message: 'Não implementado' };
    }
    /**
     * Obtém status detalhado do modo operador
     */
    async getStatus() {
        const capabilities = await leoEngine.getCapabilities();
        const systemStatus = await leoSystemMonitor.verificarSistema();
        const automationStats = await leoAutomation.getEstatisticas();
        const eventsStats = await leoEvents.getEstatisticas();
        return {
            ativo: this.config.ativo,
            configuracao: this.config,
            tempoAtivo: this.startTime ? Date.now() - this.startTime.getTime() : 0,
            capacidades: capabilities,
            performance: {
                sistema: systemStatus,
                automacao: automationStats,
                eventos: eventsStats,
            },
        };
    }
    /**
     * Registra log das ações do modo operador
     */
    async logAction(acao, descricao, dados) {
        try {
            await insertLeoActionLog({
                usuario: 'leo-operator',
                acao,
                entidade: 'leo_operator_mode',
                dados: JSON.stringify({
                    modo: 'operator',
                    nivelAutonomia: this.config.nivelAutonomia,
                    acao,
                    descricao,
                    dados,
                    timestamp: new Date(),
                }),
                resultado: 'SUCESSO',
            });
        }
        catch (error) {
            console.error('[LeoOperatorMode] Erro ao registrar log:', error);
        }
    }
}
// Exportar instância singleton
export const leoOperatorMode = LeoOperatorMode.getInstance();
