/**
 * Valores de status usados no domínio financeiro (alinhados com `finance.service.ts` e colunas varchar no Drizzle).
 * Referência em comentários em `drizzle/schema.ts` (contas_receber, contas_pagar, boletos, comissoes).
 */
export const ContaReceberStatus = {
    PENDENTE: "PENDENTE",
    RECEBIDA: "RECEBIDA",
    VENCIDA: "VENCIDA",
};
export const ContaPagarStatus = {
    PENDENTE: "PENDENTE",
    PAGO: "PAGO",
    VENCIDA: "VENCIDA",
};
/** Boletos / parcelas */
export const BoletoStatus = {
    ABERTO: "ABERTO",
    PAGO: "PAGO",
    PARCIAL: "PARCIAL",
    ATRASADO: "ATRASADO",
};
export const ComissaoStatus = {
    PENDENTE: "PENDENTE",
    PAGA: "PAGA",
};
