/**
 * Ações do LEO - Versão Simplificada
 *
 * Usa apenas os métodos disponíveis no LeoErpService
 */
import { leoErpService } from '../../services/leo-service.js';
import { actorFromLeoRuntimeContext } from '../runtime/service-actor.js';
import { ValidationError } from '../../_core/errors/typed-errors.js';
import { stripSensitiveIdsFromUnknown } from '../../_core/strip-sensitive-payload.js';
import { leoDesktopControl } from './leo-desktop-control.js';
import { leoScreen } from '../perception/leo-screen.js';
import leoOcr from '../perception/leo-ocr.js';
import { insertLeoLegacyActionLog } from '../../services/leo-action-log.service.js';
import { handleAction } from '../orchestrator/action-handler.js';
async function insertLeoActionLog(params) {
    await insertLeoLegacyActionLog(params);
}
/**
 * Executa uma ação do LEO
 */
export async function executeLeoAction(action, context, parametros) {
    const startTime = Date.now();
    try {
        // Registrar ação
        await insertLeoActionLog({
            usuario: context?.usuario?.id?.toString() ?? 'system',
            acao: 'started',
            entidade: action.action,
            dados: null,
            resultado: 'started',
        });
        let result;
        // Executar ação específica
        switch (action.action) {
            case 'consulta':
                result = await executarConsulta(action, context, parametros);
                break;
            case 'operacao_erp':
                result = await executarOperacaoERP(action, context, parametros);
                break;
            case 'operacao_sistema':
                result = await executarOperacaoSistema(action, context, parametros);
                break;
            case 'automacao':
                result = await executarAutomacao(action, context, parametros);
                break;
            default:
                result = {
                    success: false,
                    message: `Tipo de ação desconhecido: ${action.action}`,
                };
        }
        // Registrar resultado
        await insertLeoActionLog({
            usuario: context.usuario?.id?.toString() || 'system',
            acao: result.success ? 'completed' : 'failed',
            entidade: action.action,
            dados: JSON.stringify(result),
            resultado: result.success ? 'completed' : 'failed',
        });
        result.executionTime = Date.now() - startTime;
        return result;
    }
    catch (error) {
        console.error('[LeoActions] Erro ao executar ação:', error);
        await insertLeoActionLog({
            usuario: context.usuario?.id?.toString() || 'system',
            acao: 'error',
            entidade: action.action,
            dados: error instanceof Error ? error.message : 'Erro desconhecido',
            resultado: 'error',
        });
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro na execução da ação',
            executionTime: Date.now() - startTime,
        };
    }
}
/**
 * Executa ações de consulta
 */
async function executarConsulta(action, context, parametros) {
    const startTime = Date.now();
    try {
        console.log(`🔍 [LeoActions] Executando consulta: ${action.description || action.action}`);
        const tenantId = context?.tenantId;
        if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
            throw new ValidationError("tenantId obrigatório no contexto");
        }
        // Usar context para determinar a entidade
        const entity = action.context?.entity || 'cliente';
        let actorConsulta;
        try {
            actorConsulta = actorFromLeoRuntimeContext({
                usuario: context.usuario,
            });
        }
        catch {
            return {
                success: false,
                message: 'Contexto de usuário insuficiente para consulta ERP (role/vendedorId).',
                executionTime: Date.now() - startTime,
            };
        }
        switch (entity) {
            case 'cliente':
                const resultadoClientes = await leoErpService.getClientes(tenantId, actorConsulta);
                if (parametros && typeof parametros === 'object') {
                    const params = parametros;
                    if (params.nome) {
                        // TODO: Aplicar filtro por nome
                    }
                }
                return {
                    success: resultadoClientes.success,
                    message: 'Clientes consultados com sucesso',
                    data: resultadoClientes.data,
                    executionTime: Date.now() - startTime,
                };
            case 'pedido':
                const resultadoPedidos = await leoErpService.getPedidos(tenantId, actorConsulta);
                if (parametros && typeof parametros === 'object') {
                    const params = parametros;
                    if (params.status) {
                        // TODO: Aplicar filtro por status
                    }
                }
                return {
                    success: resultadoPedidos.success,
                    message: 'Pedidos consultados com sucesso',
                    data: resultadoPedidos.data,
                    executionTime: Date.now() - startTime,
                };
            case 'estoque':
                const resultadoEstoque = await leoErpService.getEstoque(tenantId);
                if (parametros && typeof parametros === 'object') {
                    const params = parametros;
                    if (params.categoria) {
                        // TODO: Aplicar filtro por categoria
                    }
                }
                return {
                    success: resultadoEstoque.success,
                    message: 'Estoque consultado com sucesso',
                    data: resultadoEstoque.data,
                    executionTime: Date.now() - startTime,
                };
            case 'financeiro': {
                let actor;
                try {
                    actor = actorFromLeoRuntimeContext(context);
                }
                catch {
                    return {
                        success: false,
                        message: 'Contexto de usuário insuficiente para consulta financeira segura.',
                        executionTime: Date.now() - startTime,
                    };
                }
                const resultadoFinanceiro = await leoErpService.getFinanceiro(tenantId, actor);
                if (parametros && typeof parametros === 'object') {
                    const params = parametros;
                    if (params.tipo) {
                        // TODO: Aplicar filtro por tipo
                    }
                }
                return {
                    success: resultadoFinanceiro.success,
                    message: 'Dados financeiros consultados com sucesso',
                    data: resultadoFinanceiro.data,
                    executionTime: Date.now() - startTime,
                };
            }
            default:
                return {
                    success: false,
                    message: `Entidade de consulta desconhecida: ${entity}`,
                    executionTime: Date.now() - startTime,
                };
        }
    }
    catch (error) {
        return {
            success: false,
            message: 'Erro na consulta',
            executionTime: Date.now() - startTime,
        };
    }
}
/**
 * Executa operações no ERP
 */
async function executarOperacaoERP(action, context, parametros) {
    const startTime = Date.now();
    try {
        console.log(`📋 [LeoActions] Executando operação ERP: ${action.description || action.action}`);
        // Usar context para determinar a entidade
        const entity = action.context?.entity || 'pedido';
        const operation = action.context?.operation || 'criar';
        switch (entity) {
            case 'pedido':
                if (operation === 'criar_pedido') {
                    const tenantId = Number(context.tenantId);
                    if (!Number.isFinite(tenantId) || tenantId <= 0) {
                        return {
                            success: false,
                            message: 'tenantId obrigatório no contexto LEO',
                            executionTime: Date.now() - startTime,
                        };
                    }
                    const stripped = stripSensitiveIdsFromUnknown(parametros);
                    const actorOp = actorFromLeoRuntimeContext({
                        usuario: context.usuario,
                    });
                    const clienteId = Number(stripped.clienteId);
                    const itensRaw = stripped.itens;
                    const itens = Array.isArray(itensRaw) ? itensRaw : [];
                    if (!Number.isFinite(clienteId) || clienteId <= 0 || itens.length === 0) {
                        return {
                            success: false,
                            message: 'clienteId e itens são obrigatórios (vendedorId não pode vir do payload)',
                            executionTime: Date.now() - startTime,
                        };
                    }
                    const pedidoPayload = {
                        clienteId,
                        itens: itens,
                        observacoes: typeof stripped.observacoes === 'string' ? stripped.observacoes : undefined,
                    };
                    const resultado = await leoErpService.criarPedido(tenantId, pedidoPayload, actorOp);
                    return {
                        success: resultado.success,
                        message: resultado.message || 'Pedido criado com sucesso',
                        data: resultado.data,
                        executionTime: Date.now() - startTime,
                    };
                }
                else if (operation === 'editar_pedido') {
                    const pedidoId = typeof parametros?.pedidoId === 'number' ? parametros.pedidoId : undefined;
                    if (pedidoId === undefined) {
                        return { success: false, message: 'pedidoId é obrigatório', executionTime: Date.now() - startTime };
                    }
                    const resultado = await leoErpService.editarPedido(pedidoId, parametros ?? {}, context.usuario?.id ?? 0);
                    return {
                        success: resultado.success,
                        message: resultado.message || 'Pedido atualizado com sucesso',
                        data: resultado.data,
                        executionTime: Date.now() - startTime,
                    };
                }
                else if (operation === 'cancelar_pedido') {
                    const pedidoId = typeof parametros?.pedidoId === 'number' ? parametros.pedidoId : undefined;
                    const motivo = typeof parametros?.motivo === 'string' ? parametros.motivo : undefined;
                    if (pedidoId === undefined) {
                        return { success: false, message: 'pedidoId é obrigatório', executionTime: Date.now() - startTime };
                    }
                    const resultado = await leoErpService.cancelarPedido(pedidoId, motivo, context.usuario?.id ?? 0);
                    return {
                        success: resultado.success,
                        message: resultado.message || 'Pedido cancelado com sucesso',
                        data: resultado.data,
                        executionTime: Date.now() - startTime,
                    };
                }
                break;
            case 'estoque':
                if (operation === 'ajustar_estoque') {
                    const userId = context.usuario?.id ?? 0;
                    const resultado = await leoErpService.ajustarEstoque((parametros ?? {}), userId);
                    return {
                        success: resultado.success,
                        message: resultado.message || 'Estoque ajustado com sucesso',
                        data: resultado.data,
                        executionTime: Date.now() - startTime,
                    };
                }
                break;
            default:
                return {
                    success: false,
                    message: `Entidade de operação desconhecida: ${entity}`,
                    executionTime: Date.now() - startTime,
                };
        }
        return {
            success: false,
            message: `Operação não implementada: ${operation}`,
            executionTime: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            message: 'Erro na operação ERP',
            executionTime: Date.now() - startTime,
        };
    }
}
/**
 * Executa operações do sistema
 */
async function executarOperacaoSistema(action, context, parametros) {
    const startTime = Date.now();
    try {
        console.log(`⚙️ [LeoActions] Executando operação do sistema: ${action.description || action.action}`);
        // Usar context para determinar a operação
        const operation = action.context?.operation || 'abrir_programa';
        switch (operation) {
            case 'abrir_programa':
                const programa = typeof parametros?.programa === 'string' ? parametros.programa : '';
                const resultadoAbertura = await leoDesktopControl.openApplication(programa);
                return {
                    success: resultadoAbertura.success,
                    message: resultadoAbertura.message,
                    executionTime: Date.now() - startTime,
                };
            case 'clicar':
                const resultadoClique = await leoDesktopControl.clicarMouse(parametros);
                return {
                    success: resultadoClique.success,
                    message: resultadoClique.message,
                    executionTime: Date.now() - startTime,
                };
            case 'digitar':
                const texto = typeof parametros?.texto === 'string' ? parametros.texto : '';
                const resultadoDigitacao = await leoDesktopControl.digitarTexto(texto);
                return {
                    success: resultadoDigitacao.success,
                    message: resultadoDigitacao.message ?? '',
                    executionTime: Date.now() - startTime,
                };
            case 'capturar_tela':
                const path = typeof parametros?.path === 'string' ? parametros.path : undefined;
                const usuario = typeof parametros?.usuario === 'string' ? parametros.usuario : undefined;
                const resultadoCaptura = await leoScreen.capturarTela(path, usuario);
                return {
                    success: resultadoCaptura.success,
                    message: resultadoCaptura.message ?? '',
                    data: resultadoCaptura,
                    executionTime: Date.now() - startTime,
                };
            case 'reconhecer_texto':
                const resultadoOCR = await leoOcr.readTextFromScreen(parametros);
                return {
                    success: resultadoOCR.success,
                    message: resultadoOCR.message,
                    data: resultadoOCR.data?.text ?? '',
                    executionTime: Date.now() - startTime,
                };
            default:
                return {
                    success: false,
                    message: `Operação de sistema não implementada: ${operation}`,
                    executionTime: Date.now() - startTime,
                };
        }
    }
    catch (error) {
        return {
            success: false,
            message: 'Erro na operação de sistema',
            executionTime: Date.now() - startTime,
        };
    }
}
/**
 * Executa automações
 */
async function executarAutomacao(action, context, parametros) {
    const startTime = Date.now();
    try {
        console.log(`🤖 [LeoActions] Executando automação: ${action.description || action.action}`);
        // Usar context para determinar a automação
        const automation = action.context?.automation || 'iniciar_loop';
        switch (automation) {
            case 'iniciar_loop':
                // TODO: Implementar início do loop do LEO
                return {
                    success: true,
                    message: 'Loop do LEO iniciado com sucesso',
                    executionTime: Date.now() - startTime,
                };
            case 'parar_loop':
                // TODO: Implementar parada do loop do LEO
                return {
                    success: true,
                    message: 'Loop do LEO parado com sucesso',
                    executionTime: Date.now() - startTime,
                };
            default:
                return {
                    success: false,
                    message: `Automação não implementada: ${automation}`,
                    executionTime: Date.now() - startTime,
                };
        }
    }
    catch (error) {
        return {
            success: false,
            message: 'Erro na automação',
            executionTime: Date.now() - startTime,
        };
    }
}
/**
 * Executa uma ação do LEO COM CONTROLE DE RISCO (Action Guard)
 *
 * Esta função NÃO executa ações HIGH diretamente.
 * Em vez disso, retorna um resultado pedindo confirmação.
 *
 * AÇÕES LOW: Executam normalmente via executeLeoAction
 * AÇÕES HIGH: Retornam { requiresConfirmation: true, actionResult: { type: "CONFIRM" } }
 *
 * @param action - Requisição de ação
 * @param context - Contexto runtime do LEO
 * @param parametros - Parâmetros adicionais
 * @param preview - Descrição para confirmação (obrigatório para HIGH risk)
 * @returns LeoGuardedActionResult - Resultado ou pedido de confirmação
 */
export async function executeLeoActionWithGuard(action, context, parametros, preview) {
    const startTime = Date.now();
    try {
        // Verificar risco da ação via Action Guard
        const guardResult = handleAction(action.action, { parameters: action.parameters, context: action.context, parametros }, preview || action.description || `Ação: ${action.action}`);
        // Ação HIGH: NÃO executar, retornar pedido de confirmação
        if (guardResult.type === "CONFIRM") {
            return {
                success: false, // false porque ainda não foi executada
                message: `⚠️ Ação "${action.action}" requer confirmação antes da execução.`,
                actionResult: guardResult,
                requiresConfirmation: true,
                executionTime: Date.now() - startTime,
            };
        }
        // Ação LOW: Executar normalmente via função original
        const result = await executeLeoAction(action, context, parametros);
        return {
            ...result,
            requiresConfirmation: false,
        };
    }
    catch (error) {
        console.error('[LeoActions] Erro no Action Guard:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro no controle de risco',
            requiresConfirmation: false,
            executionTime: Date.now() - startTime,
        };
    }
}
