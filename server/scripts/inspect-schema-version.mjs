import mysql from "mysql2/promise";

// FAIL-HARD: DATABASE_URL é obrigatório
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const url = new URL(process.env.DATABASE_URL);
const c = {
  host: url.hostname,
  port: Number(url.port || "3306"),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1).replace(/^\//, "") || "vendas_app",
};

const conn = await mysql.createConnection(c);
const [cols] = await conn.query("SHOW COLUMNS FROM schema_version");
console.log("COLUMNS schema_version:", cols);
const [rows] = await conn.query("SELECT * FROM schema_version");
console.log("ROWS schema_version:", rows);
await conn.end();

