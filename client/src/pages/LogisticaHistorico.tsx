import { useState } from "react";
import { trpc } from "@/lib/trpcClient";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";
import { History, MapPin, Clock, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function LogisticaHistorico() {
  const [cidade, setCidade] = useState("");
  const { data: historico, isLoading } = trpc.cargas.listHistoricoRotas.useQuery(
    { cidade: cidade.trim() || undefined },
    { staleTime: 30_000 }
  );

  // Agrupar por carga para melhor visualização
  const historicoAgrupado = (historico ?? []).reduce((acc: any, item: any) => {
    if (!acc[item.cargaId]) {
      acc[item.cargaId] = {
        cargaId: item.cargaId,
        cidade: item.cidade,
        data: item.data,
        rotas: []
      };
    }
    acc[item.cargaId].rotas.push(item);
    return acc;
  }, {}) || {};

  const cargas = Object.values(historicoAgrupado);

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Histórico de rotas"
        subtitle="Rotas executadas por cidade e carga"
        icon={<History className="h-5 w-5 text-primary" />}
        backTo="/logistica"
      />
      <main className={PAGE_MAIN + " space-y-4"}>
        <div className="flex gap-4 items-end">
          <div className="space-y-2">
            <Label>Filtrar por cidade</Label>
            <Input
              placeholder="Ex: Vitória"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !cargas.length ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum registro no histórico de rotas</p>
              <p className="text-sm mt-1">O histórico é preenchido automaticamente ao finalizar entregas.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {cargas.map((carga: any) => (
              <Card key={carga.cargaId} className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Carga #{carga.cargaId}</Badge>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span className="font-medium">{carga.cidade}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {carga.data ? new Date(carga.data).toLocaleDateString("pt-BR") : ""}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Ordem de entrega:</p>
                    <div className="grid gap-2">
                      {carga.rotas
                        .sort((a: any, b: any) => a.ordemEntrega - b.ordemEntrega)
                        .map((rota: any) => (
                          <div key={rota.id} className="flex items-center gap-3 text-sm p-2 bg-muted/30 rounded">
                            <span className="font-mono w-6 text-center">{rota.ordemEntrega}.</span>
                            <span className="font-medium">{rota.bairro || "Centro"}</span>
                            {rota.tempoEntrega && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {rota.tempoEntrega} min
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
