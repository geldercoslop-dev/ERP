/**
 * Utilitários para conversão de tipos
 * Padroniza conversão entre number/string para campos monetários
 */
export declare const numberToString: (value?: number | null) => string | undefined;
export declare const stringToNumber: (value?: string | null) => number | undefined;
export declare const formatCurrency: (value: number | string) => string;
export declare const MONETARY_FIELDS: readonly ["custo", "descontoFabrica", "ipi", "frete", "montagem", "lucro", "comissao", "jurosCartao", "valorVenda", "precoVenda", "precoAtacado", "precoMin", "subtotal", "total", "desconto", "acrescimo", "valorUnitario", "valorOriginal", "valorAberto", "valorPago", "valorVenda", "percentualComissao", "valorComissao", "totalPix", "totalBoleto", "totalCartao", "totalDinheiro", "totalGeral"];
export declare const NUMERIC_FIELDS: readonly ["quantidade", "estoque", "estoqueMinimo", "prazoGarantia", "numero", "id", "pedidoId", "clienteId", "vendedorId", "ordemEntrega"];
