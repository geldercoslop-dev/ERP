/**
 * safeDbCall<T> — Wrapper seguro para todas as chamadas ao banco.
 *
 * Regras:
 *  - try/catch obrigatório (nunca deixa exceção vazar silenciosamente)
 *  - loga [DB_ERROR] em caso de falha
 *  - re-throw sem fallback (o chamador decide como tratar)
 *  - bloqueia chamadas diretas da camada LEO
 */
import { logError } from "../../_core/logger.js";
import { InfrastructureError } from "../../_core/errors/typed-errors.js";
/**
 * Executa `fn` de forma segura dentro do contexto de acesso ao banco.
 *
 * @param context  Identificador de rastreio (ex.: "orders.service:createOrder")
 * @param fn       Função assíncrona que realiza a query
 * @returns        Resultado `T` da query
 * @throws         Re-lança a exceção original após logar
 */
export async function safeDbCall(context, fn) {
    // Bloquear acesso ao DB originado da camada LEO
    if (context.toUpperCase().startsWith("LEO")) {
        const msg = `[ARCH] LEO must not call DB directly — context: ${context}`;
        logError({ msg }, new Error(msg));
        throw new InfrastructureError(msg);
    }
    try {
        return await fn();
    }
    catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logError({ msg: `[DB_ERROR] [${context}] ${errMsg}` }, e instanceof Error ? e : undefined);
        throw e;
    }
}
