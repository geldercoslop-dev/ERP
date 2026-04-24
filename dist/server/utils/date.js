/**
 * Utilitários centralizados para manipulação de datas
 * Padrão único para conversão entre Date e string para banco de dados
 */
export function toDbDate(date) {
    if (!date)
        return undefined;
    return date.toISOString();
}
/**
 * Versão estrita que sempre retorna string (para quando sabemos que o Date existe)
 */
export function toDbDateStrict(date) {
    return date.toISOString();
}
