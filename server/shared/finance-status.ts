/**
 * Valores de status usados no domínio financeiro (alinhados com `finance.service.ts` e colunas varchar no Drizzle).
 * Referência em comentários em `drizzle/schema.ts` (contas_receber, contas_pagar, boletos, comissoes).
 */
export const ContaReceberStatus = {
  PENDENTE: "PENDENTE",
  RECEBIDA: "RECEBIDA",
  VENCIDA: "VENCIDA",
} as const;

export const ContaPagarStatus = {
  PENDENTE: "PENDENTE",
  PAGO: "PAGO",
  VENCIDA: "VENCIDA",
} as const;

/** Boletos / parcelas */
export const BoletoStatus = {
  ABERTO: "ABERTO",
  PAGO: "PAGO",
  PARCIAL: "PARCIAL",
  ATRASADO: "ATRASADO",
} as const;

export const ComissaoStatus = {
  PENDENTE: "PENDENTE",
  PAGA: "PAGA",
} as const;

export type ContaReceberStatusValue = (typeof ContaReceberStatus)[keyof typeof ContaReceberStatus];
export type BoletoStatusValue = (typeof BoletoStatus)[keyof typeof BoletoStatus];
