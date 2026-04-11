const mysql = require("mysql2/promise");

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: "localhost",
      port: 3306,
      user: "root",
      password: "root",
      database: "erp",
    });

    const [colRows] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'open_id'"
    );

    if (Number(colRows[0].c) === 0) {
      await conn.query("ALTER TABLE users ADD COLUMN open_id VARCHAR(255) NULL");
      console.log("ALTER_OK:users.open_id");
    } else {
      console.log("ALTER_SKIPPED:users.open_id_already_exists");
    }

    const [idxRows] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'idx_users_open_id'"
    );

    if (Number(idxRows[0].c) === 0) {
      await conn.query("CREATE INDEX idx_users_open_id ON users(open_id)");
      console.log("INDEX_OK:idx_users_open_id");
    } else {
      console.log("INDEX_SKIPPED:idx_users_open_id_already_exists");
    }

    const [verify] = await conn.query("SHOW COLUMNS FROM users LIKE 'open_id'");
    console.log("VERIFY_OPEN_ID=" + JSON.stringify(verify[0] || null));

    await conn.end();
  } catch (error) {
    console.error("DB_ERROR:", error && error.message ? error.message : String(error));
    process.exit(1);
  }
})();
