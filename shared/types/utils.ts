/**
 * Utilitários para conversão de tipos
 * Padroniza conversão entre number/string para campos monetários
 */

// Conversão de number para string (campos decimal do banco)
export const numberToString = (value?: number | null): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return String(value);
};

// Conversão de string para number (campos decimal do banco)
export const stringToNumber = (value?: string | null): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? undefined : parsed;
};

// Formatação de valores monetários
export const formatCurrency = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num);
};

// Campos monetários que devem ser string no TypeScript
export const MONETARY_FIELDS = [
  'custo',
  'descontoFabrica', 
  'ipi',
  'frete',
  'montagem',
  'lucro',
  'comissao',
  'jurosCartao',
  'valorVenda',
  'precoVenda',
  'precoAtacado',
  'precoMin',
  'subtotal',
  'total',
  'desconto',
  'acrescimo',
  'valorUnitario',
  'valorOriginal',
  'valorAberto',
  'valorPago',
  'valorVenda',
  'percentualComissao',
  'valorComissao',
  'totalPix',
  'totalBoleto',
  'totalCartao',
  'totalDinheiro',
  'totalGeral'
] as const;

// Campos que devem permanecer como number
export const NUMERIC_FIELDS = [
  'quantidade',
  'estoque',
  'estoqueMinimo',
  'prazoGarantia',
  'numero',
  'id',
  'pedidoId',
  'clienteId',
  'vendedorId',
  'ordemEntrega'
] as const;
