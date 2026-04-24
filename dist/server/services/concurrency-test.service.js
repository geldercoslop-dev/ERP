/**
 * Concurrency Test Service
 *
 * Serviço para testes de concorrência e deadlock
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */
import { runStockTransaction } from './db-transaction.js';
/**
 * Testa deadlock com locks em produtos
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */
export async function testDeadlock(produtoId1, produtoId2) {
    return await runStockTransaction(async (tx) => {
        // Garantir ordem consistente para evitar deadlock
        const [firstId, secondId] = [produtoId1, produtoId2].sort((a, b) => a - b);
        // Bloquear primeiro produto
        await tx.query("SELECT * FROM produtos WHERE id = ? FOR UPDATE", [firstId]);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await tx.query("SELECT * FROM produtos WHERE id = ? FOR UPDATE", [secondId]);
        const [r1] = await tx.query("SELECT * FROM produtos WHERE id = ? LIMIT 1", [firstId]);
        const [r2] = await tx.query("SELECT * FROM produtos WHERE id = ? LIMIT 1", [secondId]);
        const rows1 = r1;
        const rows2 = r2;
        const p1 = rows1[0] ?? null;
        const p2 = rows2[0] ?? null;
        return {
            success: true,
            message: 'Operação concluída sem deadlock',
            produto1: p1,
            produto2: p2
        };
    });
}
