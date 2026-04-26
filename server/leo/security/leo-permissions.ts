/**
 * Política Central de Permissões do Agente LEO
 * 
 * Define o que LEO pode e não pode fazer para garantir segurança
 * e integridade dos dados do sistema ERP.
 * 
 * REGRAS FUNDAMENTAIS:
 * - LEO NÃO pode alterar valores financeiros sem autorização
 * - LEO NÃO pode apagar dados permanentemente
 * - LEO NÃO pode executar comandos shell sem autorização
 * - LEO NÃO pode acessar dados de outros usuários sem permissão
 */

import { usersTool } from '../../tools/users.tool.js';
import { nanoid } from 'nanoid';

export type PermissionLevel = 'consulta' | 'operacao_erp' | 'operacao_sistema' | 'admin';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface LeoPermission {
  usuario: string;
  nivel: PermissionLevel;
  permissoes: string[];
}

export interface SecurityCheck {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  riskLevel: RiskLevel;
  warnings?: string[];
  ruleId?: string;
}

export interface SecurityRule {
  id: string;
  action: string;
  entity: string;
  allowed: boolean;
  requiresAuth: boolean;
  requiresApproval: boolean;
  riskLevel: RiskLevel;
  description: string;
  restrictions?: string[];
  auditLog: boolean;
}

/**
 * Regras de segurança do LEO
 */
const LEO_SECURITY_RULES: SecurityRule[] = [
  // === AÇÕES PERMITIDAS (BAIXO RISCO) ===
  {
    id: 'SEC001',
    action: 'consultar',
    entity: '*',
    allowed: true,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'low',
    description: 'LEO pode consultar qualquer informação do sistema',
    auditLog: true,
  },
  {
    id: 'SEC002', 
    action: 'analisar',
    entity: '*',
    allowed: true,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'low',
    description: 'LEO pode analisar dados e gerar insights',
    auditLog: true,
  },
  {
    id: 'SEC003',
    action: 'monitorar',
    entity: '*',
    allowed: true,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'low',
    description: 'LEO pode monitorar status e saúde do sistema',
    auditLog: false,
  },
  {
    id: 'SEC004',
    action: 'notificar',
    entity: '*',
    allowed: true,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'low',
    description: 'LEO pode enviar notificações e alertas',
    auditLog: true,
  },
  
  // === AÇÕES PERMITIDAS (MÉDIO RISCO) ===
  {
    id: 'SEC005',
    action: 'criar',
    entity: 'pedido',
    allowed: true,
    requiresAuth: true,
    requiresApproval: false,
    riskLevel: 'medium',
    description: 'LEO pode criar pedidos em nome do usuário autenticado',
    restrictions: ['user_context_required', 'validate_customer_data', 'max_value_10000'],
    auditLog: true,
  },
  {
    id: 'SEC006',
    action: 'atualizar',
    entity: 'estoque',
    allowed: true,
    requiresAuth: true,
    requiresApproval: false,
    riskLevel: 'medium',
    description: 'LEO pode atualizar estoque (apenas ajustes positivos)',
    restrictions: ['only_positive_adjustments', 'require_reason', 'max_100_units'],
    auditLog: true,
  },
  {
    id: 'SEC007',
    action: 'gerar',
    entity: 'relatorio',
    allowed: true,
    requiresAuth: true,
    requiresApproval: false,
    riskLevel: 'low',
    description: 'LEO pode gerar relatórios',
    restrictions: ['user_scope_only'],
    auditLog: true,
  },
  
  // === AÇÕES RESTRITAS (ALTO RISCO) ===
  {
    id: 'SEC008',
    action: 'atualizar',
    entity: 'pedido',
    allowed: true,
    requiresAuth: true,
    requiresApproval: true,
    riskLevel: 'high',
    description: 'LEO pode atualizar pedidos apenas com aprovação explícita',
    restrictions: ['no_cancel_without_approval', 'validate_status_change', 'no_price_increase'],
    auditLog: true,
  },
  {
    id: 'SEC009',
    action: 'ajustar',
    entity: 'preco',
    allowed: true,
    requiresAuth: true,
    requiresApproval: true,
    riskLevel: 'high',
    description: 'LEO pode ajustar preços apenas com aprovação explícita',
    restrictions: ['max_10_percent_change', 'require_manager_approval', 'no_decrease_below_cost'],
    auditLog: true,
  },
  
  // === AÇÕES PROIBIDAS (CRÍTICO) ===
  {
    id: 'SEC010',
    action: 'apagar',
    entity: '*',
    allowed: false,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'critical',
    description: 'LEO NUNCA pode apagar dados permanentemente',
    auditLog: true,
  },
  {
    id: 'SEC011',
    action: 'executar',
    entity: 'comando_shell',
    allowed: false,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'critical',
    description: 'LEO NUNCA pode executar comandos do sistema operacional',
    auditLog: true,
  },
  {
    id: 'SEC012',
    action: 'acessar',
    entity: 'dados_outros_usuarios',
    allowed: false,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'critical',
    description: 'LEO NUNCA pode acessar dados de outros usuários',
    auditLog: true,
  },
  {
    id: 'SEC013',
    action: 'modificar',
    entity: 'configuracao_sistema',
    allowed: false,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'critical',
    description: 'LEO NUNCA pode modificar configurações do sistema',
    auditLog: true,
  },
  {
    id: 'SEC014',
    action: 'transferir',
    entity: 'dinheiro',
    allowed: false,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'critical',
    description: 'LEO NUNCA pode realizar transferências financeiras',
    auditLog: true,
  },
  {
    id: 'SEC015',
    action: 'alterar',
    entity: 'usuario',
    allowed: false,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'critical',
    description: 'LEO NUNCA pode alterar dados de usuários ou senhas',
    auditLog: true,
  },
  {
    id: 'SEC016',
    action: 'instalar',
    entity: 'software',
    allowed: false,
    requiresAuth: false,
    requiresApproval: false,
    riskLevel: 'critical',
    description: 'LEO NUNCA pode instalar ou modificar software',
    auditLog: true,
  },
];

/**
 * Verificação de segurança centralizada do LEO
 */
function asParamRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export function checkLeoSecurity(
  userId: string,
  action: string,
  entity: string,
  parameters?: unknown,
  context?: unknown
): SecurityCheck {
  // Buscar regra de segurança
  const rule = LEO_SECURITY_RULES.find(r => 
    (r.action === action || r.action === '*') && 
    (r.entity === entity || r.entity === '*')
  );

  if (!rule) {
    return {
      allowed: false,
      reason: `Ação '${action}' na entidade '${entity}' não possui regra de segurança definida`,
      requiresApproval: false,
      riskLevel: 'high',
      warnings: ['Ação não mapeada - requer definição de segurança']
    };
  }

  // Verificar se ação é permitida
  if (!rule.allowed) {
    return {
      allowed: false,
      reason: `Ação '${action}' em '${entity}' é explicitamente proibida: ${rule.description}`,
      requiresApproval: false,
      riskLevel: rule.riskLevel,
      ruleId: rule.id ?? ''
    };
  }

  // Verificar autenticação
  if (rule.requiresAuth && !userId) {
    return {
      allowed: false,
      reason: 'Ação requer autenticação do usuário',
      requiresApproval: rule.requiresApproval,
      riskLevel: rule.riskLevel,
      ruleId: rule.id ?? ''
    };
  }

  // Verificar aprovação
  if (rule.requiresApproval) {
    return {
      allowed: false,
      reason: `Ação '${action}' requer aprovação explícita: ${rule.description}`,
      requiresApproval: true,
      riskLevel: rule.riskLevel,
      ruleId: rule.id ?? ''
    };
  }

  // Verificar restrições adicionais
  const warnings: string[] = [];
  if (rule.restrictions) {
    for (const restriction of rule.restrictions) {
      const restrictionCheck = validateSecurityRestriction(restriction, parameters, entity, context);
      if (!restrictionCheck.passed) {
        return {
          allowed: false,
          reason: `Restrição de segurança violada: ${restrictionCheck.reason}`,
          requiresApproval: false,
          riskLevel: rule.riskLevel,
          warnings: [restrictionCheck.reason || 'Restrição de segurança violada'],
          ruleId: rule.id ?? ''
        };
      }
      if (restrictionCheck.warning) {
        warnings.push(restrictionCheck.warning);
      }
    }
  }

  // Auditoria de segurança
  const finalRuleId = rule.id ?? `rule-${nanoid(8)}`;
  if (rule.auditLog) {
    auditSecurityAction(userId, action, entity, parameters, finalRuleId, true);
  }

  return {
    allowed: true,
    reason: `Ação permitida: ${rule.description}`,
    requiresApproval: false,
    riskLevel: rule.riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
    ruleId: finalRuleId
  };
}

/**
 * Valida restrições de segurança específicas
 */
function validateSecurityRestriction(
  restriction: string,
  parameters: unknown,
  entity: string,
  context?: unknown
): { passed: boolean; reason?: string; warning?: string } {
  const p = asParamRecord(parameters);
  const ctx = asParamRecord(context);
  switch (restriction) {
    case 'only_positive_adjustments':
      if (entity === 'estoque' && Number(p?.ajuste) < 0) {
        return { passed: false, reason: 'Ajustes de estoque devem ser apenas positivos' };
      }
      break;

    case 'max_10_percent_change':
      if (entity === 'preco' && Number(p?.percentualAlteracao) > 10) {
        return { passed: false, reason: 'Alteração de preço não pode exceder 10%' };
      }
      break;

    case 'no_cancel_without_approval':
      if (entity === 'pedido' && p?.novaStatus === 'CANCELADO') {
        return { passed: false, reason: 'Cancelamento de pedido requer aprovação' };
      }
      break;

    case 'user_scope_only':
      if (p?.scope != null && p.scope !== 'user') {
        return { passed: false, reason: 'Operação limitada ao escopo do usuário' };
      }
      break;

    case 'validate_customer_data':
      if (entity === 'cliente' && !p?.cpfCnpj) {
        return { passed: false, reason: 'Dados do cliente incompletos (CPF/CNPJ obrigatório)' };
      }
      break;

    case 'require_reason':
      if (!p?.motivo) {
        return { passed: false, reason: 'Ação requer justificativa' };
      }
      break;

    case 'max_value_10000':
      if (entity === 'pedido' && Number(p?.valor) > 10000) {
        return { passed: false, reason: 'Valor do pedido não pode exceder R$ 10.000,00' };
      }
      break;

    case 'max_100_units':
      if (entity === 'estoque' && Math.abs(Number(p?.ajuste ?? 0)) > 100) {
        return { passed: false, reason: 'Ajuste de estoque não pode exceder 100 unidades' };
      }
      break;

    case 'no_price_increase':
      if (entity === 'pedido' && Number(p?.novoValor) > Number(p?.valorOriginal)) {
        return { passed: false, reason: 'Não é permitido aumentar valor do pedido' };
      }
      break;

    case 'no_decrease_below_cost':
      if (entity === 'preco' && Number(p?.novoPreco) < Number(p?.precoCusto)) {
        return { passed: false, reason: 'Preço não pode ser menor que o custo' };
      }
      break;

    case 'require_manager_approval':
      if (!p?.aprovacaoGerente) {
        return { passed: false, reason: 'Ação requer aprovação do gerente' };
      }
      break;

    case 'user_context_required':
      if (!ctx?.userId || !ctx?.userRole) {
        return { passed: false, reason: 'Contexto do usuário é obrigatório' };
      }
      break;

    default:
      return { passed: true, warning: `Restrição desconhecida: ${restriction}` };
  }

  return { passed: true };
}

/**
 * Auditoria de ações do LEO
 */
function auditSecurityAction(
  userId: string,
  action: string,
  entity: string,
  parameters: unknown,
  ruleId: string,
  allowed: boolean
): void {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    entity,
    parameters: sanitizeParameters(parameters),
    ruleId,
    allowed,
    source: 'LEO_SECURITY_CHECK'
  };

  // Em ambiente real, salvar em tabela de auditoria
  console.log('[LEO SECURITY AUDIT]', auditEntry);
}

/**
 * Remove informações sensíveis para auditoria
 */
function sanitizeParameters(parameters: unknown): unknown {
  if (!parameters || typeof parameters !== 'object') return null;
  const sanitized = { ...(parameters as Record<string, unknown>) };
  
  // Remover campos sensíveis
  const sensitiveFields = ['password', 'senha', 'token', 'chave', 'secret', 'api_key'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Lista todas as regras de segurança
 */
export function listSecurityRules(): SecurityRule[] {
  return LEO_SECURITY_RULES;
}

/**
 * Verifica se ação é de alto risco
 */
export function isHighRiskAction(action: string, entity: string): boolean {
  const rule = LEO_SECURITY_RULES.find(r => 
    (r.action === action || r.action === '*') && 
    (r.entity === entity || r.entity === '*')
  );
  
  return rule ? ['high', 'critical'].includes(rule.riskLevel) : true;
}

/**
 * Verifica se um usuário tem permissão para executar uma ação (legado)
 */
export async function checkLeoPermission(
  usuario: string,
  tipoAcao: string,
  entidade: string
): Promise<boolean> {
  try {
    const permissao = await getUserPermission(usuario);
    
    if (!permissao) {
      console.warn(`[LeoPermissions] Usuário não encontrado: ${usuario}`);
      return false;
    }

    // Admin pode fazer tudo
    if (permissao.nivel === 'admin') {
      return true;
    }

    // Verificar permissão baseada no tipo de ação
    switch (tipoAcao) {
      case 'consulta':
        return permissao.nivel === 'consulta' || 
               permissao.nivel === 'operacao_erp' || 
               permissao.nivel === 'operacao_sistema';
      
      case 'operacao':
        if (entidade === 'pedido' || entidade === 'estoque' || entidade === 'cliente') {
          return permissao.nivel === 'operacao_erp' || permissao.nivel === 'operacao_sistema';
        }
        break;
      
      case 'sistema':
        return permissao.nivel === 'operacao_sistema';
      
      default:
        return false;
    }

    return false;
  } catch (error) {
    console.error('[LeoPermissions] Erro ao verificar permissão:', error);
    return false;
  }
}

/**
 * Obtém o nível de permissão de um usuário
 */
async function getUserPermission(usuario: string): Promise<LeoPermission | null> {
  try {
    const v = await usersTool.getVendedorByNome({ nome: usuario });
    if (v) {
      return {
        usuario: v.nome,
        nivel: v.admin ? 'admin' : 'operacao_erp',
        permissoes: getPermissoesPorNivel(v.admin ? 'admin' : 'operacao_erp'),
      };
    }

    const u = await usersTool.getUserByDisplayName({ displayName: usuario });
    if (u) {
      return {
        usuario: u.name ?? usuario,
        nivel: u.role === 'admin' ? 'admin' : 'consulta',
        permissoes: getPermissoesPorNivel(u.role === 'admin' ? 'admin' : 'consulta'),
      };
    }

    return {
      usuario,
      nivel: 'consulta',
      permissoes: getPermissoesPorNivel('consulta'),
    };
  } catch (error) {
    console.error('[LeoPermissions] Erro ao buscar permissão do usuário:', error);
    return null;
  }
}

/**
 * Retorna a lista de permissões baseada no nível
 */
function getPermissoesPorNivel(nivel: PermissionLevel): string[] {
  switch (nivel) {
    case 'consulta':
      return [
        'consultar_pedidos',
        'consultar_estoque',
        'consultar_clientes',
        'consultar_financeiro',
        'consultar_relatorios',
      ];
    
    case 'operacao_erp':
      return [
        ...getPermissoesPorNivel('consulta'),
        'criar_pedido',
        'editar_pedido',
        'cancelar_pedido',
        'ajustar_estoque',
        'cadastrar_cliente',
        'editar_cliente',
        'gerar_boleto',
        'registrar_pagamento',
      ];
    
    case 'operacao_sistema':
      return [
        ...getPermissoesPorNivel('operacao_erp'),
        'executar_script',
        'abrir_arquivo',
        'fazer_backup',
        'reiniciar_servico',
        'ver_logs',
        'monitorar_sistema',
      ];
    
    case 'admin':
      return [
        ...getPermissoesPorNivel('operacao_sistema'),
        'gerenciar_usuarios',
        'gerenciar_vendedores',
        'alterar_configuracoes',
        'acesso_total',
      ];
    
    default:
      return [];
  }
}

/**
 * Lista todas as permissões disponíveis
 */
export function listarTodasPermissoes(): Record<PermissionLevel, string[]> {
  return {
    consulta: getPermissoesPorNivel('consulta'),
    operacao_erp: getPermissoesPorNivel('operacao_erp'),
    operacao_sistema: getPermissoesPorNivel('operacao_sistema'),
    admin: getPermissoesPorNivel('admin'),
  };
}

/**
 * Verifica se uma permissão específica está disponível para um nível
 */
export function temPermissaoEspecifica(nivel: PermissionLevel, permissao: string): boolean {
  const permissoes = getPermissoesPorNivel(nivel);
  return permissoes.includes(permissao);
}

/**
 * Retorna o nível mínimo necessário para uma ação
 */
export function getNivelMinimoParaAcao(tipoAcao: string, entidade: string): PermissionLevel {
  // Consultas geralmente requerem nível básico
  if (tipoAcao === 'consulta') {
    return 'consulta';
  }

  // Operações de ERP requerem nível intermediário
  if (tipoAcao === 'operacao') {
    if (['pedido', 'estoque', 'cliente', 'financeiro'].includes(entidade)) {
      return 'operacao_erp';
    }
  }

  // Operações de sistema requerem nível avançado
  if (tipoAcao === 'sistema') {
    return 'operacao_sistema';
  }

  // Ações administrativas requerem nível admin
  if (['usuario', 'vendedor', 'configuracao'].includes(entidade)) {
    return 'admin';
  }

  // Padrão: requer nível admin por segurança
  return 'admin';
}

/**
 * Promove um usuário para um nível superior (apenas admins podem fazer isso)
 */
export async function promoverUsuario(
  solicitante: string,
  usuarioAlvo: string,
  novoNivel: PermissionLevel
): Promise<{ success: boolean; message: string }> {
  try {
    // Verificar se solicitante é admin
    const permissaoSolicitante = await getUserPermission(solicitante);
    if (!permissaoSolicitante || permissaoSolicitante.nivel !== 'admin') {
      return {
        success: false,
        message: 'Apenas administradores podem promover usuários',
      };
    }

    // Implementar promoção (será feito quando tivermos tabela de permissões específica)
    return {
      success: false,
      message: 'Promoção de usuário ainda não implementada',
    };
  } catch (error) {
    console.error('[LeoPermissions] Erro ao promover usuário:', error);
    return {
      success: false,
      message: 'Erro ao promover usuário',
    };
  }
}
