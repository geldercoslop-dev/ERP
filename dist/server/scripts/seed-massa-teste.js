/**
 * Massa de teste mínima para roteiro operacional (clientes + produtos).
 * Usar apenas em ambiente de desenvolvimento/teste. Não altera regras de negócio.
 *
 * Pré-requisito: ao menos um vendedor existente (ex.: npm run seed:admin).
 * Uso: npx tsx server/scripts/seed-massa-teste.ts
 */
import "../_core/loadEnv.js";
import * as db from "../db/index.js";
const PREFIX = "[seed-massa-teste]";
async function main() {
    const conn = await db.getDb();
    if (!conn) {
        console.error(`${PREFIX} Banco indisponível. Configure DATABASE_URL ou DB_*.`);
        process.exit(1);
    }
    const tenantIdRaw = Number(process.env.DEFAULT_TENANT_ID || process.env.TENANT_ID || "");
    if (!Number.isFinite(tenantIdRaw) || tenantIdRaw <= 0) {
        console.error(`${PREFIX} DEFAULT_TENANT_ID (ou TENANT_ID) é obrigatório para seed sem hardcode.`);
        process.exit(1);
    }
    const tenantId = tenantIdRaw;
    const vendedores = await db.getAllVendedores();
    const vendedorId = vendedores.length > 0 ? vendedores[0].id : undefined;
    if (!vendedorId) {
        console.warn(`${PREFIX} Nenhum vendedor encontrado. Rode npm run seed:admin antes. Clientes serão criados sem vínculo.`);
    }
    // Clientes de teste (telefones únicos)
    const clientesMassa = [
        { nome: "Cliente Teste 1", telefone: "27999001001" },
        { nome: "Cliente Teste 2", telefone: "27999001002" },
        { nome: "Cliente Teste 3", telefone: "27999001003" },
        { nome: "Cliente Teste 4", telefone: "27999001004" },
        { nome: "Cliente Teste 5", telefone: "27999001005" },
    ];
    for (const c of clientesMassa) {
        try {
            await db.createCliente(tenantId, { nome: c.nome, telefone: c.telefone }, vendedorId);
            console.log(`${PREFIX} Cliente criado: ${c.nome}`);
        }
        catch (e) {
            if (e instanceof Error && e.message?.includes("Já existe") || e?.code === "ER_DUP_ENTRY") {
                console.log(`${PREFIX} Cliente já existe: ${c.nome}`);
            }
            else {
                console.error(`${PREFIX} Erro ao criar cliente ${c.nome}:`, e instanceof Error ? e.message : String(e));
            }
        }
    }
    // Produtos de teste (estoque inicial 10)
    const produtosMassa = [
        { descricao: "Produto Teste A", valorVenda: "100.00", estoque: 10, fornecedor: "Fornecedor Teste" },
        { descricao: "Produto Teste B", valorVenda: "250.00", estoque: 10, fornecedor: "Fornecedor Teste" },
        { descricao: "Produto Teste C", valorVenda: "75.50", estoque: 10 },
        { descricao: "Produto Teste D", valorVenda: "320.00", estoque: 10 },
        { descricao: "Produto Teste E", valorVenda: "55.00", estoque: 10 },
    ];
    for (const p of produtosMassa) {
        try {
            await db.createProduto(tenantId, {
                descricao: p.descricao,
                valorVenda: p.valorVenda,
                estoque: p.estoque,
                fornecedor: p.fornecedor,
                custo: "0",
                ativo: true,
            });
            console.log(`${PREFIX} Produto criado: ${p.descricao}`);
        }
        catch (e) {
            console.error(`${PREFIX} Erro ao criar produto ${p.descricao}:`, e instanceof Error ? e.message : String(e));
        }
    }
    console.log(`${PREFIX} Concluído.`);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
