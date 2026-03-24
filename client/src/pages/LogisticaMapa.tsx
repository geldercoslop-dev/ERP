import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpcClient";
import { skipToken } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";
import { Truck, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type RawMapaChunk = Record<string, unknown>;

type MapaPonto = {
  pedidoCargaId: number;
  ordemEntrega: number;
  cliente: string;
  enderecoCompleto: string;
  bairro: string;
  cidade: string;
  lat: number;
  lng: number;
  pedidoNumero: number;
};

type MapaCargaView = {
  cidade: string;
  dataEntrega: string | null;
  pontos: MapaPonto[];
};

function buildMapaForCarga(raw: RawMapaChunk[] | undefined, cargaId: number): MapaCargaView {
  if (!raw?.length) return { cidade: "Rota", dataEntrega: null, pontos: [] };
  const chunks = raw.filter((r) => Number(r.cargaId) === cargaId);
  if (!chunks.length) return { cidade: "Rota", dataEntrega: null, pontos: [] };

  const pontos: MapaPonto[] = [];
  let ordem = 1;
  for (const ch of chunks) {
    const cidadeChunk = String(ch.cidade ?? "");
    const pedidosRaw = ch.pedidos;
    const pedidos = Array.isArray(pedidosRaw) ? (pedidosRaw as Record<string, unknown>[]) : [];
    for (const p of pedidos) {
      const rua = p.rua != null ? String(p.rua) : "";
      const num = p.clienteNumero != null ? String(p.clienteNumero) : "";
      const bairro = p.bairro != null ? String(p.bairro) : "";
      const cidade = p.cidade != null ? String(p.cidade) : cidadeChunk;
      const enderecoCompleto = [rua, num, bairro, cidade].filter(Boolean).join(", ");
      const idNum = Number(p.id);
      pontos.push({
        pedidoCargaId: Number.isFinite(idNum) ? idNum : ordem,
        ordemEntrega: ordem++,
        cliente: String(p.clienteNome ?? ""),
        enderecoCompleto,
        bairro,
        cidade,
        lat: 0,
        lng: 0,
        pedidoNumero: Number(p.numero) || 0,
      });
    }
  }
  const cidadeHeader = String(chunks[0]?.cidade ?? "Rota");
  return { cidade: cidadeHeader, dataEntrega: null, pontos };
}

/**
 * Mapa da rota da carga: exibe todos os endereços e uma linha da rota.
 * Sem :id mostra lista de cargas para escolher. Com :id mostra o mapa (OpenStreetMap/Leaflet).
 */
export default function LogisticaMapa() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const cargaId = id ? Number(id) : 0;
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const { data: cargas } = trpc.cargas.list.useQuery(undefined, { staleTime: 30_000 });
  const { data: rawMapa, isLoading } = trpc.cargas.getPontosMapa.useQuery(
    id && cargaId > 0 ? { cargaId } : skipToken,
    {
      staleTime: 60_000,
    }
  );

  const data = useMemo(
    () => (id && cargaId > 0 ? buildMapaForCarga(rawMapa as unknown as RawMapaChunk[] | undefined, cargaId) : null),
    [rawMapa, cargaId, id]
  );

  if (!id) {
    return (
      <div className={PAGE_WRAPPER}>
        <PageHeader title="Mapa da rota" subtitle="Selecione uma carga" backTo="/logistica" icon={<MapPin className="h-5 w-5 text-primary" />} />
        <main className={PAGE_MAIN}>
          <div className="grid gap-3">
            {((cargas ?? []) as { id: number; numero?: number; cidadeRota?: string }[]).map((c) => (
              <Card key={c.id} className="cursor-pointer hover:shadow-md" onClick={() => setLocation(`/logistica/mapa/${c.id}`)}>
                <CardContent className="p-4 flex justify-between items-center">
                  <span className="font-bold">Carga #{c.numero}</span>
                  <span className="text-muted-foreground">{c.cidadeRota}</span>
                  <Button size="sm" variant="outline">
                    Ver mapa
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  useEffect(() => {
    if (!mapRef.current || !data?.pontos?.length || mapLoaded) return;

    const loadMap = async () => {
      try {
        const mod = await import("leaflet");
        const L = (mod as { default?: typeof import("leaflet") }).default ?? mod;
        await import("leaflet/dist/leaflet.css");

        delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
          iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        });

        const pontosValidos = data.pontos.filter((p) => p.lat && p.lng && p.lat !== 0 && p.lng !== 0);

        if (pontosValidos.length === 0) {
          const lat = -19.5;
          const lng = -40.3;
          const map = L.map(mapRef.current!).setView([lat, lng], 11);

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap",
          }).addTo(map);

          data.pontos.forEach((p, i: number) => {
            const pos: [number, number] = [lat + i * 0.008, lng + i * 0.008];
            L.marker(pos)
              .addTo(map)
              .bindPopup(
                `<strong>${p.ordemEntrega}. ${p.cliente}</strong><br/>${p.enderecoCompleto || `${p.bairro || ""}, ${p.cidade || ""}`}<br/><small>Coordenadas aproximadas</small>`
              );
          });
        } else {
          const lats = pontosValidos.map((p) => p.lat);
          const lngs = pontosValidos.map((p) => p.lng);
          const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
          const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

          const map = L.map(mapRef.current!).setView([centerLat, centerLng], 12);

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap",
          }).addTo(map);

          const marcadores: InstanceType<(typeof L)["Marker"]>[] = [];

          data.pontos.forEach((p, i: number) => {
            if (p.lat && p.lng && p.lat !== 0 && p.lng !== 0) {
              const pos: [number, number] = [p.lat, p.lng];
              const marker = L.marker(pos)
                .addTo(map)
                .bindPopup(
                  `<strong>${p.ordemEntrega}. ${p.cliente}</strong><br/>${p.enderecoCompleto || `${p.bairro || ""}, ${p.cidade || ""}`}<br/><small>Pedido #${p.pedidoNumero}</small>`
                );
              marcadores.push(marker);
            } else {
              const pos: [number, number] = [centerLat + i * 0.008, centerLng + i * 0.008];
              L.marker(pos)
                .addTo(map)
                .bindPopup(
                  `<strong>${p.ordemEntrega}. ${p.cliente}</strong><br/>${p.enderecoCompleto || `${p.bairro || ""}, ${p.cidade || ""}`}<br/><small>Coordenadas aproximadas</small>`
                );
            }
          });

          if (marcadores.length >= 2) {
            const coords: [number, number][] = marcadores.map((marker) => {
              const latlng = marker.getLatLng();
              return [latlng.lat, latlng.lng];
            });
            L.polyline(coords, { color: "#2563eb", weight: 4, opacity: 0.7 }).addTo(map);
          }

          const group = new L.FeatureGroup(marcadores);
          if (marcadores.length > 0) {
            map.fitBounds(group.getBounds().pad(0.1));
          }
        }

        setMapLoaded(true);
      } catch {
        setMapLoaded(true);
      }
    };

    loadMap();
  }, [data, mapLoaded]);

  if (isLoading || rawMapa === undefined || !data) {
    return (
      <div className={PAGE_WRAPPER}>
        <PageHeader title="Mapa da rota" backTo="/logistica" icon={<MapPin className="h-5 w-5 text-primary" />} />
        <main className={PAGE_MAIN}>
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={`Mapa — ${data.cidade || "Rota"}`}
        subtitle={data.dataEntrega ? `Entrega: ${data.dataEntrega}` : ""}
        backTo="/logistica"
        icon={<MapPin className="h-5 w-5 text-primary" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => setLocation(`/cargas/${cargaId}`)} className="gap-2">
            <Truck className="h-4 w-4" /> Ver carga
          </Button>
        }
      />
      <main className={PAGE_MAIN + " space-y-4"}>
        <div className="rounded-lg border border-border overflow-hidden bg-muted/30" style={{ minHeight: 400 }}>
          <div ref={mapRef} className="w-full h-[400px]" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold mb-2">Endereços da rota ({data.pontos.length})</h3>
          <ul className="space-y-1 text-sm">
            {data.pontos.map((p) => (
              <li key={p.pedidoCargaId} className="flex gap-2">
                <span className="text-muted-foreground w-6">{p.ordemEntrega}.</span>
                <span className="font-medium">{p.cliente}</span>
                <span className="text-muted-foreground">— {p.enderecoCompleto || `${p.bairro}, ${p.cidade}`}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
