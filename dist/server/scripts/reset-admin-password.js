/**
 * Script para resetar senha do admin
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
function getConnectionConfig() {
    const host = process.env.DB_HOST?.trim();
    const user = process.env.DB_USER?.trim();
    const password = process.env.DB_PASSWORD || "";
    const database = process.env.DB_NAME?.trim() || "vendas_app";
    if (!host || !user || password === undefined) {
        throw new Error("Credenciais obrigatórias. Defina DB_HOST, DB_USER, DB_PASSWORD.");
    }
    return {
        host,
        port: parseInt(process.env.DB_PORT ?? "3306", 10),
        user,
        password,
        database,
    };
}
async function resetAdminPassword() {
    const config = getConnectionConfig();
    const connection = await mysql.createConnection(config);
    try {
        console.log("[reset-admin] Buscando usuário admin...");
        // Buscar usuário admin na tabela vendedores
        const [adminRows] = await connection.execute("SELECT id, nome, email FROM vendedores WHERE nome LIKE '%admin%' OR email = 'admin@local.com' LIMIT 1");
        const admins = adminRows;
        if (admins.length === 0) {
            console.log("[reset-admin] Nenhum vendedor admin encontrado. Criando...");
            // Primeiro verificar se existe user admin
            const [userRows] = await connection.execute("SELECT id FROM users WHERE openId = 'admin' LIMIT 1");
            const users = userRows;
            if (users.length === 0) {
                console.log("[reset-admin] Criando user admin primeiro...");
                const [userResult] = await connection.execute(`INSERT INTO users (tenantId, openId, name, email, role, createdAt, updatedAt, lastSignedIn) 
           VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())`, [1, "admin", "Administrador", "admin@local.com", "admin"]);
                const userId = userResult.insertId;
                console.log(`[reset-admin] User admin criado com ID: ${userId}`);
                // Criar vendedor admin
                const newPassword = "admin123";
                const hashedPassword = await bcrypt.hash(newPassword, 12);
                const [vendedorResult] = await connection.execute(`INSERT INTO vendedores (tenantId, userId, nome, email, senha, admin, ativo, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`, [1, userId, "Administrador", "admin@local.com", hashedPassword, 1, 1]);
                console.log(`[reset-admin] Vendedor admin criado com ID: ${vendedorResult.insertId}`);
                console.log(`[reset-admin] Senha definida como: ${newPassword}`);
            }
            else {
                const user = users[0];
                console.log("[reset-admin] User admin encontrado, criando vendedor...");
                const newPassword = "admin123";
                const hashedPassword = await bcrypt.hash(newPassword, 12);
                const [vendedorResult] = await connection.execute(`INSERT INTO vendedores (tenantId, userId, nome, email, senha, admin, ativo, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`, [1, user.id, "Administrador", "admin@local.com", hashedPassword, 1, 1]);
                console.log(`[reset-admin] Vendedor admin criado com ID: ${vendedorResult.insertId}`);
                console.log(`[reset-admin] Senha definida como: ${newPassword}`);
            }
        }
        else {
            const admin = admins[0];
            console.log(`[reset-admin] Vendedor admin encontrado: ${admin.nome} (${admin.email})`);
            // Resetar senha na tabela vendedores
            const newPassword = "admin123";
            const hashedPassword = await bcrypt.hash(newPassword, 12);
            await connection.execute("UPDATE vendedores SET senha = ?, updatedAt = NOW() WHERE id = ?", [hashedPassword, admin.id]);
            console.log(`[reset-admin] Senha resetada para: ${newPassword}`);
        }
        console.log("\n✅ Senha do admin resetada com sucesso!");
        console.log("📝 Credenciais:");
        console.log("   Usuário: admin");
        console.log("   Senha: admin123");
        console.log("   URL: http://localhost:5173/");
    }
    finally {
        await connection.end();
    }
}
resetAdminPassword().catch((err) => {
    console.error("[reset-admin] Erro:", err.message ?? err);
    process.exit(1);
});
