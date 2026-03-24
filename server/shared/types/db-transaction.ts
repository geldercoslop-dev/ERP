/**
 * Tipo do callback de transação Drizzle (MySQL2), para evitar `any` em `tx`.
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../../drizzle/schema";

type AppDb = MySql2Database<typeof schema>;

export type DbTransaction = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
