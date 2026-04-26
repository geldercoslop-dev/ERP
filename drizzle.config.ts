import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: "mysql://root:root@localhost:3306/erp",
  },
  strict: true,
  verbose: false,
  // DATABASE IMMUTABLE LAYER v1 - Disable all inference
  // PROIBIDO: rename inference
  // PROIBIDO: automatic decisions
  // PROIBIDO: interactive prompts
  schemaFilter: ["public"],
  tablesFilter: ["!__drizzle_migrations"],
});
