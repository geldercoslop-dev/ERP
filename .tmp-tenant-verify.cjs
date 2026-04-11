const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({ host:"localhost", port:3306, user:"root", password:"root", database:"erp" });
  const expected = [
    "users","vendedores","produtos","clientes","pedidos","itens_pedido","cargas","plano_contas","fornecedores","contas_fixas","contas_pagar","contas_receber","comissoes","counters"
  ];
  const missing = [];
  for (const t of expected) {
    const [rows] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'tenant_id'", [t]);
    if (Number(rows[0].c) === 0) missing.push(t);
  }
  const [tenantRow] = await conn.query("SELECT id,name FROM tenants WHERE id=1 LIMIT 1");
  console.log("MISSING_AFTER_FIX=" + missing.join(","));
  console.log("TENANT_ROW=" + JSON.stringify(tenantRow[0] || null));
  await conn.end();
})();
