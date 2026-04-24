/**
 * Tipos seguros para resultados de operações de banco de dados
 * Evita casting inseguro de ResultSetHeader
 */
/**
 * Type guard para verificar se objeto é DbResult válido
 */
export function isDbResult(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const result = obj;
    return ((typeof result.insertId === 'number' || result.insertId === undefined) &&
        (typeof result.affectedRows === 'number' || result.affectedRows === undefined));
}
/**
 * Converte resultado de banco para DbResult de forma segura
 */
export function toDbResult(raw) {
    const result = raw;
    return {
        insertId: typeof result.insertId === 'number' ? result.insertId : undefined,
        affectedRows: typeof result.affectedRows === 'number' ? result.affectedRows : undefined,
    };
}
