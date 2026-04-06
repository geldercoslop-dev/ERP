/**
 * Tipos seguros para resultados de operações de banco de dados
 * Evita casting inseguro de ResultSetHeader
 */

export interface DbResult {
  insertId?: number;
  affectedRows?: number;
}

/**
 * Type guard para verificar se objeto é DbResult válido
 */
export function isDbResult(obj: unknown): obj is DbResult {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  
  const result = obj as Record<string, unknown>;
  return (
    (typeof result.insertId === 'number' || result.insertId === undefined) &&
    (typeof result.affectedRows === 'number' || result.affectedRows === undefined)
  );
}

/**
 * Converte resultado de banco para DbResult de forma segura
 */
export function toDbResult(raw: unknown): DbResult {
  const result = raw as unknown as Record<string, unknown>;
  
  return {
    insertId: typeof result.insertId === 'number' ? result.insertId : undefined,
    affectedRows: typeof result.affectedRows === 'number' ? result.affectedRows : undefined,
  };
}
