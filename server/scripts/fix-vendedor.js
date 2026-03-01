import "dotenv/config";
import * as mysql from "mysql2/promise";

async function main() {
  console.log("Iniciando script de correção de vendedor...");
  
  // Conectar ao banco de dados
  let connection;
  try {
    console.log("Conectando ao banco de dados...");
    
    // Usar configurações do .env
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'vendas_app'
    };
    
    connection = await mysql.createConnection(config);
    console.log("Conexão estabelecida com sucesso!");
    
    // Verificar se o vendedor GELDER existe
    const [rows] = await connection.execute(
      'SELECT * FROM vendedores WHERE nome = ?',
      ['GELDER']
    );
    
    if (rows.length > 0) {
      console.log("Vendedor GELDER encontrado:", rows[0]);
      
      // Atualizar a senha para texto simples (temporariamente)
      await connection.execute(
        'UPDATE vendedores SET senha = ? WHERE id = ?',
        ['787578', rows[0].id]
      );
      
      console.log("Senha do vendedor GELDER atualizada para texto simples (787578)");
    } else {
      console.log("Vendedor GELDER não encontrado. Criando...");
      
      // Criar o vendedor GELDER
      const result = await connection.execute(
        'INSERT INTO vendedores (nome, senha, admin, ativo, cidade) VALUES (?, ?, ?, ?, ?)',
        ['GELDER', '787578', 1, 1, 'COLATINA']
      );
      
      console.log("Vendedor GELDER criado com sucesso:", result[0].insertId);
    }
    
    // Verificar todos os vendedores
    const [allVendedores] = await connection.execute('SELECT id, nome, senha, admin, ativo FROM vendedores');
    console.log("Todos os vendedores:");
    allVendedores.forEach(v => {
      console.log(`ID: ${v.id}, Nome: ${v.nome}, Admin: ${v.admin}, Ativo: ${v.ativo}, Senha: ${v.senha ? v.senha.substring(0, 10) + '...' : 'null'}`);
    });
    
  } catch (error) {
    console.error("Erro:", error);
  } finally {
    if (connection) {
      await connection.end();
      console.log("Conexão encerrada");
    }
  }
}

main().catch(console.error);