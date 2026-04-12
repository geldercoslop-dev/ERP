/**
 * Utilitário básico para extração de campos numéricos do primeiro item de um array de resultados.
 * NÃO usar para centralização em massa ainda — apenas para validação controlada do padrão.
 */

/**
 * Extrai um campo numérico do primeiro item de um array de resultados.
 * @param result Resultado da query (array ou desconhecido)
 * @param field Nome do campo a extrair
 * @param defaultValue Valor padrão caso não exista
 * @returns O valor numérico extraído ou defaultValue
 */
export function extractNumberFieldFromFirstRow(
  result: unknown,
  field: string,
  defaultValue: number = 0
): number {
  if (!Array.isArray(result) || result.length === 0) return defaultValue;
  const first = result[0];
  if (!first || typeof first !== 'object' || first === null) return defaultValue;
  if (!(field in first)) return defaultValue;
  const value = (first as Record<string, unknown>)[field];
  return Number(value ?? defaultValue);
}
