import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: "mysql://root:root@localhost:3306/erp",
  },
});
