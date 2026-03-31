/**
 * Tipos centralizados para Stock
 */
export interface StockInfo {
    produtoId: number;
    produtoNome: string;
    saldo: number;
    reservado: number;
    disponivel: number;
    estoqueMinimo: number;
    status: 'normal' | 'baixo' | 'critico';
    ultimaAtualizacao: Date;
}
export interface StockLock {
    produtoId: number;
    usuarioId: number;
    quantidade: number;
    motivo: string;
    criadoEm: Date;
    expiraEm: Date;
}
export interface StockMovement {
    id: number;
    produtoId: number;
    tipo: 'entrada' | 'saida';
    quantidade: number;
    saldoAnterior: number;
    saldoNovo: number;
    motivo?: string;
    usuarioId: number;
    pedidoId?: number;
    createdAt: Date;
}
export interface StockOperationRequest {
    produtoId: number;
    quantidade: number;
    tipo: 'entrada' | 'saida';
    motivo?: string;
}
export interface StockResult {
    success: boolean;
    produtoId: number;
    saldoAnterior: number;
    saldoNovo: number;
    quantidadeProcessada: number;
    message?: string;
    traceId?: string;
}
export interface StockFilter {
    produtoId?: number;
    categoria?: string;
    status?: 'normal' | 'baixo' | 'critico';
    limite?: number;
}
