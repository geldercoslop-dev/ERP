/**
 * Integração cotação de moedas — AwesomeAPI (gratuito, sem chave).
 * https://docs.awesomeapi.com.br/api-de-moedas
 * Cache: 5 min (server/cache/api-cache.ts).
 */
import { getOrSet } from "../cache/api-cache.js";
const BASE = "https://economia.awesomeapi.com.br/json/last";
/**
 * Cotação de moedas (USD-BRL, EUR-BRL, etc.).
 */
export async function cotacaoMoeda(moeda = "USD") {
    const par = moeda === "BTC" ? "BTC-BRL" : `${moeda}-BRL`;
    return getOrSet(`currency:${par}`, async () => {
        try {
            const res = await fetch(`${BASE}/${par}`, { signal: AbortSignal.timeout(15000) });
            if (!res.ok)
                return { ok: false, erro: "Serviço de cotações indisponível." };
            const data = (await res.json());
            const key = Object.keys(data)[0];
            if (!key)
                return { ok: false, erro: "Resposta inválida." };
            const item = data[key];
            if (!item)
                return { ok: false, erro: "Resposta inválida." };
            return {
                ok: true,
                cotacao: {
                    codigo: item.code ?? moeda,
                    nome: item.name ?? par,
                    compra: Number(item.bid ?? 0),
                    venda: Number(item.ask ?? 0),
                    variacao: item.pctChange,
                },
            };
        }
        catch (e) {
            const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao consultar cotação." : e instanceof Error ? e.message : "Erro ao consultar cotação.";
            return { ok: false, erro: msg };
        }
    });
}
