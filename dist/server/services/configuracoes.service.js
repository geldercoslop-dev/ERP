import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { configuracoes } from "../../drizzle/schema.js";
import { getConfig as getConfigCore, setConfig as setConfigCore } from "../db/core.js";
import { assertDbConnection } from "../_core/errors/assertions.js";
export async function getConfig(chave) {
    return getConfigCore(chave);
}
export async function setConfig(chave, valor) {
    return setConfigCore(chave, valor);
}
export async function listConfigKeysLike(pattern) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn
        .select({ chave: configuracoes.chave })
        .from(configuracoes)
        .where(sql `${configuracoes.chave} LIKE ${pattern}`);
    return rows.map((r) => r.chave ?? "").filter(Boolean);
}
export async function deleteConfigByChave(chave) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    await dbConn.delete(configuracoes).where(eq(configuracoes.chave, chave));
}
