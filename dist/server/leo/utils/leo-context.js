/**
 * Contexto do LEO
 *
 * Responsável por reunir informações do sistema para tomada de decisão:
 * - usuário logado
 * - estado ERP
 * - alertas
 * - estoque
 * - pedidos recentes
 * - estado do servidor
 */
/**
 * Constrói o contexto completo do Leo para tomada de decisão
 */
export async function buildLeoContext(usuarioNome, tenantId) {
    // LEO não acessa DB diretamente: contexto base operacional.
    const contextoBase = {
        tenantId,
        usuario: {
            nome: usuarioNome,
        },
        erp: {
            pedidosHoje: 0,
            pedidosPendentes: 0,
            clientesCount: 0,
            produtosCount: 0,
            estoqueBaixo: 0,
        },
        alertas: {
            estoqueCritico: 0,
            pedidosAtrasados: 0,
            sistemaIssues: 0,
        },
        servidor: {
            uptime: process.uptime(),
            memoria: process.memoryUsage(),
            databaseConnected: false,
        },
        timestamp: new Date(),
    };
    return contextoBase;
}
