const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({ host:"localhost", port:3306, user:"root", password:"root", database:"erp" });
  const expected = [
    "users","vendedores","produtos","promocoes","promocoes_itens","clientes","pedidos","itens_pedido","cargas","boletos","plano_contas","fornecedores","contas_fixas","contas_pagar","contas_receber","caixa_mensal","comissoes","pendencias","counters","audit_logs","financial_idempotency"
  ];
  const [tables] = await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()");
  const existing = new Set(tables.map((r) => r.table_name ?? r.TABLE_NAME));
  const missing = [];
  const present = [];
  for (const t of expected) {
    if (!existing.has(t)) continue;
    present.push(t);
    const [rows] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'tenant_id'", [t]);
    const c = Number(rows[0].c ?? rows[0].C ?? 0);
    if (c === 0) missing.push(t);
  }
  const [tenantsRows] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'tenants'");
  console.log("PRESENT=" + present.join(","));
  console.log("MISSING_TENANT_ID=" + missing.join(","));
  console.log("TENANTS_EXISTS=" + (Number(tenantsRows[0].c ?? 0) > 0 ? "1" : "0"));
  await conn.end();
})();
