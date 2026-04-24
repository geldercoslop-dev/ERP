/**
 * Utilitários de paginação para performance
 * Impede que clientes solicitem grandes volumes de dados
 */
export const PAGINATION_LIMITS = {
    MAX_PAGE_SIZE: 100,
    DEFAULT_PAGE_SIZE: 50,
    MIN_PAGE_SIZE: 1,
};
/**
 * Valida e normaliza parâmetros de paginação
 * @param page Número da página (opcional)
 * @param pageSize Tamanho da página (opcional)
 * @returns Parâmetros validados e normalizados
 */
export function validatePaginationParams(page, pageSize) {
    // Validar e normalizar página
    const normalizedPage = Math.max(page || 1, PAGINATION_LIMITS.MIN_PAGE_SIZE);
    // Validar e normalizar pageSize
    const normalizedPageSize = Math.min(Math.max(pageSize || PAGINATION_LIMITS.DEFAULT_PAGE_SIZE, PAGINATION_LIMITS.MIN_PAGE_SIZE), PAGINATION_LIMITS.MAX_PAGE_SIZE);
    // Calcular offset
    const offset = (normalizedPage - 1) * normalizedPageSize;
    return {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        offset,
    };
}
/**
 * Cria metadados de paginação para resposta
 * @param page Página atual
 * @param pageSize Tamanho da página
 * @param total Total de itens
 * @returns Metadados de paginação
 */
export function createPaginationMetadata(page, pageSize, total) {
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;
    return {
        page,
        pageSize,
        total,
        hasMore,
        totalPages,
    };
}
/**
 * Middleware para validar paginação em procedures tRPC
 */
export function withPaginationValidation(input) {
    const { page, pageSize } = validatePaginationParams(input.page, input.pageSize);
    return {
        ...input,
        page,
        pageSize,
    };
}
