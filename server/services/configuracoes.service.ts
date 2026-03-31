import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { configuracoes } from "../../drizzle/schema.js";
import { getConfig as getConfigCore, setConfig as setConfigCore } from "../db/core.js";

export async function getConfig(chave: string): Promise<string | null> {
  return getConfigCore(chave);
}

export async function setConfig(chave: string, valor: string): Promise<void> {
  return setConfigCore(chave, valor);
}

export async function listConfigKeysLike(pattern: string): Promise<string[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const rows = await dbConn
    .select({ chave: configuracoes.chave })
    .from(configuracoes)
    .where(sql`${configuracoes.chave} LIKE ${pattern}`);
  return rows.map((r) => r.chave ?? "").filter(Boolean);
}

export async function deleteConfigByChave(chave: string): Promise<void> {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.delete(configuracoes).where(eq(configuracoes.chave, chave));
}
