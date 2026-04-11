const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({ host:"localhost", port:3306, user:"root", password:"root", database:"erp" });
  const tables = [
    "users","vendedores","produtos","clientes","pedidos","itens_pedido","cargas","plano_contas","fornecedores","contas_fixas","contas_pagar","contas_receber","comissoes","counters"
  ];

  for (const t of tables) {
    const sql = `ALTER TABLE ${t} ADD COLUMN tenant_id INT NOT NULL DEFAULT 1`;
    await conn.query(sql);
    console.log(`ALTER_OK:${t}`);
  }

  await conn.query(`CREATE TABLE IF NOT EXISTS tenants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255)
  )`);
  console.log("TENANTS_TABLE_OK");

  await conn.query(`INSERT INTO tenants (id, name)
    VALUES (1, 'default')
    ON DUPLICATE KEY UPDATE name='default'`);
  console.log("TENANT_DEFAULT_OK");

  await conn.end();
})();
