const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({ host:"localhost", port:3306, user:"root", password:"root", database:"erp" });
  const [rows] = await conn.query("SHOW COLUMNS FROM users");
  console.log(rows.map(r => r.Field).join(','));
  await conn.end();
})();
