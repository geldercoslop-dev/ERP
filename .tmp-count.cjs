const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({ host:"localhost", port:3306, user:"root", password:"root", database:"erp" });
  const [rows] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'tenant_id'");
  console.log(JSON.stringify(rows));
  await conn.end();
})();
