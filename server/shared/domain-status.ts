/**
 * Valores canônicos de status do domínio (ERP).
 * Todas as comparações, SQL e inputs críticos devem referenciar estes objetos / arrays — sem literais soltos.
 */

/** Referência nomeada (mesmos valores de PedidoStatusValues) */
export const PedidoStatus = {
  GERADO: "GERADO",
  CONFERIDO: "CONFERIDO",
  IMPRESSO: "IMPRESSO",
  EM_ROTA: "EM_ROTA",
  ENTREGUE: "ENTREGUE",
  CANCELADO: "CANCELADO",
  PENDENTE_ESTOQUE: "PENDENTE_ESTOQUE",
} as const;

export const PedidoStatusValues = [
  "GERADO",
  "CONFERIDO",
  "IMPRESSO",
  "EM_ROTA",
  "ENTREGUE",
  "CANCELADO",
  "PENDENTE_ESTOQUE",
] as const;

export type PedidoStatusValue = (typeof PedidoStatusValues)[number];
export type PedidoStatusType = typeof PedidoStatus[keyof typeof PedidoStatus];

/**
 * Matriz oficial de transições permitidas entre status de pedidos.
 * Cada status mapeia para os status para os quais pode transicionar.
 * Estado terminal: apenas transição para si mesmo (permanecer no estado).
 */
export const PedidoStatusTransitions: Record<PedidoStatusValue, PedidoStatusValue[]> = {
  GERADO: ["GERADO", "CONFERIDO", "CANCELADO"],
  CONFERIDO: ["CONFERIDO", "IMPRESSO", "CANCELADO"],
  IMPRESSO: ["IMPRESSO", "EM_ROTA", "CANCELADO"],
  EM_ROTA: ["EM_ROTA", "ENTREGUE", "CANCELADO"],
  ENTREGUE: ["ENTREGUE"],
  CANCELADO: ["CANCELADO"],
  PENDENTE_ESTOQUE: ["PENDENTE_ESTOQUE", "GERADO", "CANCELADO"],
};

/**
 * Resultado da validação de transição de status.
 */
export interface PedidoStatusTransitionResult {
  valid: boolean;
  allowed: boolean;
  from: string;
  to: string;
  reason?: string;
}

/**
 * Valida se uma transição de status de pedido é permitida.
 * @param from - Status de origem
 * @param to - Status de destino
 * @returns Objeto com resultado da validação
 */
export function validatePedidoStatusTransition(
  from: string,
  to: string
): PedidoStatusTransitionResult {
  const validFrom = PedidoStatusValues.includes(from as PedidoStatusValue);
  const validTo = PedidoStatusValues.includes(to as PedidoStatusValue);

  if (!validFrom && !validTo) {
    return {
      valid: false,
      allowed: false,
      from,
      to,
      reason: `Status origem e destino inválidos: ${from}, ${to}`,
    };
  }

  if (!validFrom) {
    return {
      valid: false,
      allowed: false,
      from,
      to,
      reason: `Status origem inválido: ${from}`,
    };
  }

  if (!validTo) {
    return {
      valid: false,
      allowed: false,
      from,
      to,
      reason: `Status destino inválido: ${to}`,
    };
  }

  const allowedTransitions = PedidoStatusTransitions[from as PedidoStatusValue];
  const allowed = allowedTransitions.includes(to as PedidoStatusValue);

  if (!allowed) {
    return {
      valid: true,
      allowed: false,
      from,
      to,
      reason: `Transição não permitida: ${from} → ${to}`,
    };
  }

  return {
    valid: true,
    allowed: true,
    from,
    to,
  };
}

/**
 * Assertiva para transição de status de pedido.
 * Lança Error se a transição for inválida ou não permitida.
 * @param from - Status de origem
 * @param to - Status de destino
 * @throws Error se a transição for inválida
 */
export function assertPedidoStatusTransition(from: string, to: string): void {
  const result = validatePedidoStatusTransition(from, to);

  if (!result.valid || !result.allowed) {
    throw new Error(result.reason || `Transição de status inválida: ${from} → ${to}`);
  }
}

export const ContaReceberStatusValues = ["PENDENTE", "RECEBIDA", "VENCIDA", "CANCELADO"] as const;
export type ContaReceberStatusValue = (typeof ContaReceberStatusValues)[number];

export const ContaReceberStatus = {
  PENDENTE: "PENDENTE",
  RECEBIDA: "RECEBIDA",
  VENCIDA: "VENCIDA",
  CANCELADO: "CANCELADO",
} as const satisfies Record<string, ContaReceberStatusValue>;

export const ContaPagarStatusValues = ["PENDENTE", "PAGO", "VENCIDA"] as const;
export type ContaPagarStatusValue = (typeof ContaPagarStatusValues)[number];

export const ContaPagarStatus = {
  PENDENTE: "PENDENTE",
  PAGO: "PAGO",
  VENCIDA: "VENCIDA",
} as const satisfies Record<string, ContaPagarStatusValue>;

export const BoletoStatusValues = ["ABERTO", "PAGO", "PARCIAL", "ATRASADO"] as const;
export type BoletoStatusValue = (typeof BoletoStatusValues)[number];

export const BoletoStatus = {
  ABERTO: "ABERTO",
  PAGO: "PAGO",
  PARCIAL: "PARCIAL",
  ATRASADO: "ATRASADO",
} as const satisfies Record<string, BoletoStatusValue>;

export const PendenciaStatusValues = ["PENDENTE", "COMPRADO", "RESOLVIDO"] as const;
export type PendenciaStatusValue = (typeof PendenciaStatusValues)[number];

export const PendenciaStatus = {
  PENDENTE: "PENDENTE",
  COMPRADO: "COMPRADO",
  RESOLVIDO: "RESOLVIDO",
} as const satisfies Record<string, PendenciaStatusValue>;

/** Status de cargas / rota (coluna `cargas.status`). Inclui valores usados no fluxo atual. */
export const CargaStatusValues = [
  "ABERTA",
  "GERADO",
  "CONFERIDO",
  "EM_ROTA",
  "ENTREGUE",
  "CANCELADO",
] as const;

export type CargaStatusValue = (typeof CargaStatusValues)[number];

export const CargaStatus = {
  ABERTA: "ABERTA",
  GERADO: "GERADO",
  CONFERIDO: "CONFERIDO",
  EM_ROTA: "EM_ROTA",
  ENTREGUE: "ENTREGUE",
  CANCELADO: "CANCELADO",
} as const satisfies Record<string, CargaStatusValue>;

export const ComissaoStatusValues = ["PENDENTE", "PAGA"] as const;
export type ComissaoStatusValue = (typeof ComissaoStatusValues)[number];

export const ComissaoStatus = {
  PENDENTE: "PENDENTE",
  PAGA: "PAGA",
} as const satisfies Record<string, ComissaoStatusValue>;
