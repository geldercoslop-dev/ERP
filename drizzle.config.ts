import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function getDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "3306";
  const user = process.env.DB_USER || "vendas";
  const password = process.env.DB_PASSWORD || "vendas123";
  const database = process.env.DB_NAME || "vendas_app";
  const enc = encodeURIComponent;
  return `mysql://${enc(user)}:${enc(password)}@${host}:${port}/${database}`;
}

export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: getDbUrl(),
  },
});
