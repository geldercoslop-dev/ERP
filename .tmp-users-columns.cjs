const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "root", database: "erp" });
  const [rows] = await conn.query("SHOW COLUMNS FROM users");
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
})();
