/**
 * Integração SuperFrete — cotação, etiqueta e rastreamento.
 * Requer SUPERFRETE_API_KEY.
 * Documentação: https://superfrete.readme.io/
 * Cache: 5 min para cotação (server/cache/api-cache.ts).
 */
import { getOrSet } from "../cache/api-cache.js";
const BASE = process.env.SUPERFRETE_SANDBOX === "1"
    ? "https://sandbox.superfrete.com"
    : "https://api.superfrete.com";
function getToken() {
    return process.env.SUPERFRETE_API_KEY;
}
function getHeaders() {
    const token = getToken();
    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "User-Agent": "ERP-GRS-Leo/1.0 (contato@grs.app)",
    };
}
/**
 * Cotar frete via SuperFrete.
 * Sem chave retorna: "integração SuperFrete não configurada"
 */
export async function cotarFreteSuperFrete(params) {
    const token = getToken();
    if (!token) {
        return { ok: false, erro: "integração SuperFrete não configurada" };
    }
    const cacheKey = `superfrete:${params.cepOrigem.replace(/\D/g, "")}:${params.cepDestino.replace(/\D/g, "")}:${params.peso}:${params.largura ?? 16}:${params.altura ?? 10}:${params.comprimento ?? 20}`;
    return getOrSet(cacheKey, async () => {
        const TIMEOUT_MS = 20000;
        try {
            const body = {
                from: { postal_code: params.cepOrigem.replace(/\D/g, "").slice(0, 8) },
                to: { postal_code: params.cepDestino.replace(/\D/g, "").slice(0, 8) },
                package: {
                    weight: params.peso,
                    width: params.largura ?? 16,
                    height: params.altura ?? 10,
                    length: params.comprimento ?? 20,
                },
            };
            const res = await fetch(`${BASE}/api/v0/calculator`, {
                method: "POST",
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: getHeaders(),
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.text();
                return { ok: false, erro: err || "Erro ao cotar frete SuperFrete." };
            }
            const data = (await res.json());
            const list = Array.isArray(data) ? data : data?.data ?? data?.offers ?? [];
            const opcoes = list.map((x) => ({
                nome: x.carrier?.name ?? x.name ?? x.transportadora ?? "Transportadora",
                preco: Number(x.price ?? x.valor ?? x.cost ?? 0),
                prazo: Number(x.delivery_time ?? x.prazo ?? x.days ?? 0),
            })).filter((o) => o.nome);
            return { ok: true, opcoes: opcoes.length ? opcoes : undefined };
        }
        catch (e) {
            const msg = e?.name === "AbortError" ? "Timeout ao cotar SuperFrete." : e?.message ?? "Erro ao cotar frete.";
            return { ok: false, erro: msg };
        }
    });
}
/**
 * Gera etiqueta de envio (requer pedido/serviço já criado no SuperFrete).
 */
export async function gerarEtiquetaSuperFrete(shipmentId) {
    const token = getToken();
    if (!token) {
        return { ok: false, erro: "integração SuperFrete não configurada" };
    }
    try {
        const res = await fetch(`${BASE}/api/v0/shipments/${shipmentId}/label`, {
            method: "GET",
            signal: AbortSignal.timeout(15000),
            headers: getHeaders(),
        });
        if (!res.ok)
            return { ok: false, erro: "Erro ao gerar etiqueta SuperFrete." };
        const data = (await res.json());
        const url = data.url ?? data.link ?? data.label_url ?? data.pdf_url;
        return { ok: true, urlEtiqueta: url };
    }
    catch (e) {
        const msg = e?.name === "AbortError" ? "Timeout ao gerar etiqueta." : e?.message ?? "Erro ao gerar etiqueta.";
        return { ok: false, erro: msg };
    }
}
/**
 * Consulta rastreamento de entrega pelo código.
 */
export async function consultarRastreamentoSuperFrete(codigo) {
    const token = getToken();
    if (!token) {
        return { ok: false, erro: "integração SuperFrete não configurada" };
    }
    const c = String(codigo).trim().replace(/\s/g, "");
    if (!c)
        return { ok: false, erro: "Informe o código de rastreio." };
    try {
        const res = await fetch(`${BASE}/api/v0/tracking?code=${encodeURIComponent(c)}`, {
            method: "GET",
            signal: AbortSignal.timeout(15000),
            headers: getHeaders(),
        });
        if (!res.ok)
            return { ok: false, erro: "Rastreamento não encontrado ou indisponível." };
        const data = (await res.json());
        const eventos = (data.tracking?.events ?? data.events ?? data.history ?? []).map((e) => ({
            data: e.date ?? e.data ?? "",
            hora: e.time ?? e.hora,
            descricao: e.description ?? e.descricao ?? e.status ?? "",
            local: e.location ?? e.local ?? e.place,
        }));
        return {
            ok: true,
            codigo: c,
            eventos: eventos.length ? eventos : undefined,
        };
    }
    catch (e) {
        const msg = e?.name === "AbortError" ? "Timeout ao rastrear." : e?.message ?? "Erro ao rastrear.";
        return { ok: false, erro: msg };
    }
}
