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
};
export const PedidoStatusValues = [
    "GERADO",
    "CONFERIDO",
    "IMPRESSO",
    "EM_ROTA",
    "ENTREGUE",
    "CANCELADO",
    "PENDENTE_ESTOQUE",
];
export const ContaReceberStatusValues = ["PENDENTE", "RECEBIDA", "VENCIDA"];
export const ContaReceberStatus = {
    PENDENTE: "PENDENTE",
    RECEBIDA: "RECEBIDA",
    VENCIDA: "VENCIDA",
};
export const ContaPagarStatusValues = ["PENDENTE", "PAGO", "VENCIDA"];
export const ContaPagarStatus = {
    PENDENTE: "PENDENTE",
    PAGO: "PAGO",
    VENCIDA: "VENCIDA",
};
export const BoletoStatusValues = ["ABERTO", "PAGO", "PARCIAL", "ATRASADO"];
export const BoletoStatus = {
    ABERTO: "ABERTO",
    PAGO: "PAGO",
    PARCIAL: "PARCIAL",
    ATRASADO: "ATRASADO",
};
export const PendenciaStatusValues = ["PENDENTE", "COMPRADO", "RESOLVIDO"];
export const PendenciaStatus = {
    PENDENTE: "PENDENTE",
    COMPRADO: "COMPRADO",
    RESOLVIDO: "RESOLVIDO",
};
/** Status de cargas / rota (coluna `cargas.status`). Inclui valores usados no fluxo atual. */
export const CargaStatusValues = [
    "ABERTA",
    "GERADO",
    "CONFERIDO",
    "EM_ROTA",
    "ENTREGUE",
    "CANCELADO",
];
export const CargaStatus = {
    ABERTA: "ABERTA",
    GERADO: "GERADO",
    CONFERIDO: "CONFERIDO",
    EM_ROTA: "EM_ROTA",
    ENTREGUE: "ENTREGUE",
    CANCELADO: "CANCELADO",
};
export const ComissaoStatusValues = ["PENDENTE", "PAGA"];
export const ComissaoStatus = {
    PENDENTE: "PENDENTE",
    PAGA: "PAGA",
};
