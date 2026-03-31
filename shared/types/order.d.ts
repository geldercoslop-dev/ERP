/**
 * Tipos de pedido — entidades (Pedido, ItemPedido, Cliente) vêm de entities.ts
 */
export interface CreatePedidoData {
    clienteId: number;
    vendedorId?: number;
    itens: ItemPedidoData[];
    frete?: number;
    desconto?: number;
    observacoes?: string;
    dataEntrega?: Date;
}
export interface ItemPedidoData {
    produtoId: number;
    corId?: number;
    quantidade: number;
    precoUnitario?: number;
}
export interface UpdatePedidoStatusData {
    id: number;
    status: "CONFERIDO" | "EM_ROTA" | "ENTREGUE" | "CANCELADO";
    motivo?: string;
}
export interface PedidoFilter {
    status?: "GERADO" | "CONFERIDO" | "EM_ROTA" | "ENTREGUE" | "CANCELADO" | "PENDENTE_ESTOQUE";
    clienteId?: number;
    vendedorId?: number;
    dataInicio?: Date;
    dataFim?: Date;
    limite?: number;
}
