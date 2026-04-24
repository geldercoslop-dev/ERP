/**
 * Integração BrasilAPI — CNPJ, DDD, feriados nacionais (gratuito).
 * https://brasilapi.com.br/
 * Cache: 5 min (server/cache/api-cache.ts).
 */
import { getOrSet } from "../cache/api-cache.js";
const BASE = "https://brasilapi.com.br/api";
function limparCnpj(cnpj) {
    return String(cnpj).replace(/\D/g, "").slice(0, 14);
}
/** Consulta CNPJ na Receita (via BrasilAPI). */
export async function consultarCnpj(cnpj) {
    const c = limparCnpj(cnpj);
    if (c.length !== 14)
        return { ok: false, erro: "CNPJ deve ter 14 dígitos." };
    return getOrSet(`brasilapi:cnpj:${c}`, async () => {
        try {
            const res = await fetch(`${BASE}/cnpj/v1/${c}`, { signal: AbortSignal.timeout(15000) });
            if (!res.ok)
                return { ok: false, erro: "CNPJ não encontrado ou serviço indisponível." };
            const data = (await res.json());
            return { ok: true, dados: data };
        }
        catch (e) {
            const msg = e?.name === "AbortError" ? "Timeout ao consultar CNPJ." : e?.message ?? "Erro ao consultar BrasilAPI.";
            return { ok: false, erro: msg };
        }
    });
}
/** Consulta DDD (lista de cidades do estado). */
export async function consultarDdd(ddd) {
    const d = String(ddd).replace(/\D/g, "").slice(0, 2);
    if (d.length !== 2)
        return { ok: false, erro: "DDD deve ter 2 dígitos." };
    return getOrSet(`brasilapi:ddd:${d}`, async () => {
        try {
            const res = await fetch(`${BASE}/ddd/v1/${d}`, { signal: AbortSignal.timeout(15000) });
            if (!res.ok)
                return { ok: false, erro: "DDD não encontrado." };
            const data = (await res.json());
            return { ok: true, estado: data.state, cidades: data.cities };
        }
        catch (e) {
            return { ok: false, erro: e?.message ?? "Erro ao consultar DDD." };
        }
    });
}
/** Feriados nacionais do ano. */
export async function listarFeriadosNacionais(ano) {
    return getOrSet(`brasilapi:feriados:${ano}`, async () => {
        try {
            const res = await fetch(`${BASE}/feriados/v1/${ano}`, { signal: AbortSignal.timeout(15000) });
            if (!res.ok)
                return { ok: false, erro: "Erro ao listar feriados." };
            const data = (await res.json());
            return { ok: true, feriados: data };
        }
        catch (e) {
            const msg = e?.name === "AbortError" ? "Timeout ao listar feriados." : e?.message ?? "Erro ao consultar feriados.";
            return { ok: false, erro: msg };
        }
    });
}
