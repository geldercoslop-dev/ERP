/**
 * Validação de valores de domínio em runtime (anti-regressão).
 * Use em inputs críticos (status, tipo enumerado) antes de persistir ou montar query.
 */

import { ValidationError } from '../../_core/errors/typed-errors.js';

const isReadonlyStringList = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Garante que `value` é um dos valores permitidos do enum (array readonly de strings).
 * @param value valor vindo de API / payload
 * @param allowed tupla readonly (ex.: PedidoStatusValues)
 * @param fieldName nome para mensagem de erro
 */
export function validateStatus<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fieldName = "status"
): T[number] {
  if (!isReadonlyStringList(allowed)) {
    throw new ValidationError("validateStatus: lista de valores inválida");
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} inválido: esperado string, recebido ${typeof value}`);
  }
  const trimmed = value.trim();
  if (!(allowed as readonly string[]).includes(trimmed)) {
    throw new ValidationError(`${fieldName} inválido: "${value}" (permitidos: ${allowed.join(", ")})`);
  }
  return trimmed as T[number];
}
