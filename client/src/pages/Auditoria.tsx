import { useState } from "react";
import { trpc } from "@/lib/trpcClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";
import { ShieldCheck, Search } from "lucide-react";

export default function Auditoria() {
  const [pedidoId, setPedidoId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters = {
    pedidoId: pedidoId.trim() ? parseInt(pedidoId, 10) : undefined,
    clienteId: clienteId.trim() ? parseInt(clienteId, 10) : undefined,
    entity: entity.trim() || undefined,
    action: action.trim() || undefined,
    dateFrom: dateFrom ? new Date(dateFrom + "T00:00:00") : undefined,
    dateTo: dateTo ? new Date(dateTo + "T23:59:59") : undefined,
    limit: 200,
  };

  const { data: events, isLoading } = trpc.audit.list.useQuery(
    {
      ...filters,
      pedidoId: isNaN(filters.pedidoId as number) ? undefined : filters.pedidoId,
      clienteId: isNaN(filters.clienteId as number) ? undefined : filters.clienteId,
    },
    { staleTime: 60_000, refetchOnWindowFocus: false }
  );

  const list = (events ?? []) as Array<{
    id: number;
    createdAt: string;
    actorUserId: number | null;
    actorVendedorId: number | null;
    action: string;
    entity: string;
    entityId: string | null;
    payloadJson: string | null;
    traceId: string | null;
  }>;

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Auditoria operacional"
        subtitle="Rastreio de ações (estoque, pedidos, etc.) — somente admin"
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <main className={PAGE_MAIN + " space-y-4"}>
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" /> Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Pedido ID</Label>
              <Input
                placeholder="Ex: 123"
                value={pedidoId}
                onChange={(e) => setPedidoId(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cliente ID</Label>
              <Input
                placeholder="Ex: 45"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entidade</Label>
              <Input
                placeholder="estoque, pedido..."
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ação</Label>
              <Input
                placeholder="ENTRADA, SAIDA..."
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data de</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Eventos ({list.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {list.map((ev) => (
                  <div
                    key={ev.id}
                    className="border rounded-lg p-3 text-sm bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                      <span>{new Date(ev.createdAt).toLocaleString("pt-BR")}</span>
                      <span className="font-semibold text-foreground">{ev.action}</span>
                      <span>{ev.entity}</span>
                      {ev.entityId && <span>id={ev.entityId}</span>}
                      {ev.actorUserId != null && <span>userId={ev.actorUserId}</span>}
                      {ev.actorVendedorId != null && <span>vendedorId={ev.actorVendedorId}</span>}
                      {ev.traceId && <span>trace={ev.traceId}</span>}
                    </div>
                    {ev.payloadJson && (
                      <pre className="mt-2 text-xs bg-background/80 p-2 rounded border overflow-x-auto whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                        {(() => {
                          try {
                            const o = JSON.parse(ev.payloadJson);
                            return JSON.stringify(o, null, 2);
                          } catch {
                            return ev.payloadJson;
                          }
                        })()}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
