/**
 * Serviço de sugestão automática de rotas usando OpenRouteService ou fallback por proximidade (bairros).
 * Retorna ordem sugerida de entrega; o usuário pode aceitar ou ignorar.
 */
const OPENROUTE_API_KEY = process.env.OPENROUTE_API_KEY || "";
/**
 * Ordena pontos por ordem sugerida (TSP simplificado ou API).
 * Se OPENROUTE_API_KEY estiver definida, usa OpenRouteService; senão usa fallback por bairro/cidade.
 */
export async function gerarRotaSugerida(pontos) {
    if (!pontos.length)
        return { ordem: [], detalhes: [], via: "fallback" };
    if (OPENROUTE_API_KEY && pontos.length >= 2) {
        try {
            const coords = await geocodePontos(pontos);
            const validos = coords.filter((c) => c.lat !== 0 || c.lng !== 0);
            if (validos.length >= 2) {
                const ordem = ordenarPorProximidade(validos);
                if (ordem.length) {
                    const detalhes = ordem.map((idx, i) => ({
                        pedidoCargaId: validos[idx].pedidoCargaId,
                        ordemEntrega: i,
                    }));
                    return { ordem: ordem.map((i) => validos[i].pedidoCargaId), detalhes, via: "openroute" };
                }
            }
        }
        catch (e) {
            console.warn("[rota-sugerida] OpenRoute falhou, usando fallback:", e.message);
        }
    }
    // Fallback: ordenar por bairro alfabético (agrupa bairros próximos na lista) e depois por cidade
    const ordenados = [...pontos]
        .sort((a, b) => {
        const c = (a.cidade || "").localeCompare(b.cidade || "");
        if (c !== 0)
            return c;
        return (a.bairro || "").localeCompare(b.bairro || "");
    })
        .map((p) => p.pedidoCargaId);
    const detalhes = ordenados.map((pedidoCargaId, i) => ({ pedidoCargaId, ordemEntrega: i }));
    return { ordem: ordenados, detalhes, via: "fallback" };
}
async function geocodePontos(pontos) {
    const out = [];
    const base = "https://api.openrouteservice.org/geocode/search";
    for (const p of pontos) {
        const query = [p.endereco, p.bairro, p.cidade].filter(Boolean).join(", ");
        if (!query) {
            out.push({ lat: 0, lng: 0, pedidoCargaId: p.pedidoCargaId });
            continue;
        }
        try {
            const url = `${base}?api_key=${encodeURIComponent(OPENROUTE_API_KEY)}&text=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            const data = (await res.json());
            const feat = data?.features?.[0];
            if (feat?.geometry?.coordinates) {
                const [lng, lat] = feat.geometry.coordinates;
                out.push({ lat, lng, pedidoCargaId: p.pedidoCargaId });
            }
            else {
                out.push({ lat: 0, lng: 0, pedidoCargaId: p.pedidoCargaId });
            }
        }
        catch {
            out.push({ lat: 0, lng: 0, pedidoCargaId: p.pedidoCargaId });
        }
    }
    return out;
}
/** Ordena pontos por proximidade (nearest-neighbor) a partir do primeiro. */
function ordenarPorProximidade(coords) {
    if (coords.length <= 1)
        return coords.map((_, i) => i);
    const dist = (i, j) => {
        const a = coords[i], b = coords[j];
        return Math.hypot(a.lat - b.lat, a.lng - b.lng);
    };
    const rest = new Set(coords.map((_, i) => i));
    const order = [0];
    rest.delete(0);
    while (rest.size) {
        const last = order[order.length - 1];
        let best = -1, bestD = Infinity;
        for (const i of Array.from(rest)) {
            const d = dist(last, i);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        if (best < 0)
            break;
        order.push(best);
        rest.delete(best);
    }
    return order;
}
