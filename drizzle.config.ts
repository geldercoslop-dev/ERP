import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function getDbUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL é obrigatório para drizzle-kit (defina no .env)");
  }
  return url;
}

export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: getDbUrl(),
  },
});
