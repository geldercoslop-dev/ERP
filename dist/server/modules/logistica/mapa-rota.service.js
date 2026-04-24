/**
 * Serviço para dados do mapa da rota: lista de endereços e polyline (se disponível) para exibição no front.
 * OpenStreetMap/Leaflet no client; aqui apenas retornamos os pontos e opcionalmente geometria.
 */
import * as logisticaService from "../../services/logistica.service.js";
/**
 * Geocoding usando OpenStreetMap Nominatim API (gratuita)
 */
async function geocodeEndereco(endereco) {
    try {
        const query = encodeURIComponent(endereco);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
            headers: {
                'User-Agent': 'GRS-Logistica-Map/1.0'
            }
        });
        if (!response.ok) {
            console.warn(`[geocode] Falha na requisição: ${response.status}`);
            return { lat: 0, lng: 0 };
        }
        const data = (await response.json());
        const arr = Array.isArray(data) ? data : [];
        if (arr.length > 0) {
            const result = arr[0];
            return {
                lat: parseFloat(result.lat),
                lng: parseFloat(result.lon)
            };
        }
    }
    catch (error) {
        console.warn(`[geocode] Erro ao geocodificar "${endereco}":`, error);
    }
    return { lat: 0, lng: 0 };
}
export async function obterPontosMapaCarga(tenantId, cargaId) {
    const carga = await logisticaService.getCargaById(tenantId, cargaId);
    if (!carga)
        return null;
    const cargaObj = carga;
    const pedidos = cargaObj.pedidos ?? [];
    const cidadeRota = String(cargaObj.cidadeRota ?? "");
    const dataEntrega = cargaObj.dataEntrega
        ? new Date(cargaObj.dataEntrega).toLocaleDateString("pt-BR")
        : "";
    const pontos = [];
    // Processar pedidos em paralelo para melhor performance
    const geocodePromises = pedidos.map(async (p) => {
        const row = p;
        const rua = String(row.clienteRua ?? "");
        const numero = String(row.clienteNumero ?? "");
        const bairro = String(row.bairro ?? row.clienteBairro ?? "");
        const cidade = String(row.cidade ?? row.clienteCidade ?? cidadeRota);
        const partes = [rua, numero, bairro, cidade].filter(Boolean);
        const enderecoCompleto = partes.join(", ") || "Endereço não informado";
        // Geocoding do endereço completo
        let lat = 0, lng = 0;
        if (enderecoCompleto && enderecoCompleto !== "Endereço não informado") {
            const coords = await geocodeEndereco(enderecoCompleto);
            lat = coords.lat;
            lng = coords.lng;
        }
        return {
            pedidoCargaId: Number(row.pedidoCargaId ?? 0),
            pedidoNumero: Number(row.numero ?? 0),
            ordemEntrega: Number(row.ordemEntrega ?? 0) + 1,
            cliente: String(row.clienteNome ?? ""),
            bairro,
            cidade,
            enderecoCompleto,
            lat,
            lng,
        };
    });
    const pontosGeocoded = await Promise.all(geocodePromises);
    pontos.push(...pontosGeocoded);
    return { cidade: cidadeRota, dataEntrega, pontos };
}
