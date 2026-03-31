/**
 * Valores canônicos de status do domínio (ERP).
 * Todas as comparações, SQL e inputs críticos devem referenciar estes objetos / arrays — sem literais soltos.
 */

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

/** Referência nomeada (mesmos valores de PedidoStatusValues) */
export const PedidoStatus = {
  GERADO: "GERADO",
  CONFERIDO: "CONFERIDO",
  IMPRESSO: "IMPRESSO",
  EM_ROTA: "EM_ROTA",
  ENTREGUE: "ENTREGUE",
  CANCELADO: "CANCELADO",
  PENDENTE_ESTOQUE: "PENDENTE_ESTOQUE",
} as const satisfies Record<string, PedidoStatusValue>;

export const ContaReceberStatusValues = ["PENDENTE", "RECEBIDA", "VENCIDA"] as const;
export type ContaReceberStatusValue = (typeof ContaReceberStatusValues)[number];

export const ContaReceberStatus = {
  PENDENTE: "PENDENTE",
  RECEBIDA: "RECEBIDA",
  VENCIDA: "VENCIDA",
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
