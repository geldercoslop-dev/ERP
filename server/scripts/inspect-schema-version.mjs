import mysql from "mysql2/promise";

const c = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "vendas",
  password: process.env.DB_PASSWORD ?? "vendas123",
  database: process.env.DB_NAME ?? "vendas_app",
};

const conn = await mysql.createConnection(c);
const [cols] = await conn.query("SHOW COLUMNS FROM schema_version");
console.log("COLUMNS schema_version:", cols);
const [rows] = await conn.query("SELECT * FROM schema_version");
console.log("ROWS schema_version:", rows);
await conn.end();

