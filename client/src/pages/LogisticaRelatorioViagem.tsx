import { useState } from "react";
import { trpc } from "../lib/trpcClient";
import { PageHeader } from "../components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "../components/layout/pageLayout";
import { FileText, Truck, Download, Calendar, MapPin, Package } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useLocation } from "wouter";
import { useToast } from "../hooks/use-toast";

export default function LogisticaRelatorioViagem() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [cargaId, setCargaId] = useState<number | null>(null);

  const { data: cargas } = trpc.cargas.list.useQuery(undefined, { staleTime: 30_000 });
  const { data: carga, isLoading } = trpc.cargas.getById.useQuery(
    { id: cargaId! },
    { enabled: cargaId != null && cargaId > 0, staleTime: 30_000 }
  );
  const gerarRelatorioPDF = trpc.cargas.gerarRelatorioViagemPDF.useMutation();

  const lista = (cargas ?? []) as any[];

  const handleGerarPDF = async () => {
    if (!cargaId) return;
    
    try {
      const dataUri = await gerarRelatorioPDF.mutateAsync({ cargaId });
      const numero = String((carga as any)?.numero || '').padStart(4, '0');
      const cidade = String((carga as any)?.cidadeRota || 'ROTA').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 30);
      const dt = (carga as any)?.dataEntrega ? new Date((carga as any).dataEntrega) : new Date();
      const iso = dt.toISOString().split('T')[0];
      
      const link = document.createElement('a');
      link.href = String(dataUri);
      link.download = `RELATORIO_VIAGEM_${numero}_${cidade}_${iso}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({ title: "Relatório gerado", description: "PDF do relatório de viagem gerado com sucesso." });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao gerar relatório", variant: "destructive" });
    }
  };

  const money = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Relatório de viagem"
        subtitle="Número da carga, data, cidade e lista de pedidos"
        icon={<FileText className="h-5 w-5 text-primary" />}
        backTo="/logistica"
      />
      <main className={PAGE_MAIN + " space-y-6"}>
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">Selecione uma carga</h3>
            <div className="flex flex-wrap gap-2">
              {lista.map((c: any) => (
                <Button
                  key={c.id}
                  variant={cargaId === c.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCargaId(c.id)}
                >
                  #{c.numero} {c.cidadeRota}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {cargaId && (isLoading || carga) && (
          <Card>
            <CardContent className="p-6 space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : carga ? (
                <>
                  {/* Cabeçalho do relatório */}
                  <div className="border-b pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold">RELATÓRIO DE VIAGEM</h2>
                      <div className="flex gap-2">
                        <Badge variant={String((carga as any).status) === "ENTREGUE" ? "default" : "secondary"}>
                          {(carga as any).status}
                        </Badge>
                        <Button variant="outline" size="sm" className="gap-2" onClick={handleGerarPDF} disabled={gerarRelatorioPDF.isPending}>
                          <Download className="h-4 w-4" />
                          {gerarRelatorioPDF.isPending ? "Gerando..." : "PDF"}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground">Nº Carga:</span>
                          <span className="font-bold ml-1">#{(carga as any).numero}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground">Data:</span>
                          <span className="font-bold ml-1">
                            {(carga as any).dataEntrega ? new Date((carga as any).dataEntrega).toLocaleDateString("pt-BR") : "—"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground">Cidade:</span>
                          <span className="font-bold ml-1">{(carga as any).cidadeRota}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground">Pedidos:</span>
                          <span className="font-bold ml-1">{((carga as any).pedidos ?? []).length}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lista de pedidos */}
                  <div>
                    <h4 className="font-semibold mb-3">Rota executada</h4>
                    <div className="rounded-lg border overflow-hidden">
                      <div className="grid grid-cols-5 bg-muted/50 text-sm font-medium p-3 gap-4">
                        <span>Ordem</span>
                        <span>Pedido</span>
                        <span>Cliente</span>
                        <span>Valor</span>
                        <span>Status</span>
                      </div>
                      <div className="divide-y">
                        {((carga as any).pedidos ?? [])
                          .sort((a: any, b: any) => Number(a.ordemEntrega ?? 0) - Number(b.ordemEntrega ?? 0))
                          .map((p: any, i: number) => (
                          <div key={p.pedidoCargaId ?? p.id} className="grid grid-cols-5 p-3 gap-4 text-sm items-center">
                            <span className="font-mono">{Number(p.ordemEntrega ?? i) + 1}</span>
                            <span className="font-medium">#{p.numero}</span>
                            <span className="truncate">{p.clienteNome}</span>
                            <span className="font-medium">R$ {money(p.total)}</span>
                            <Badge className={p.entregue ? "bg-green-600" : "bg-yellow-600"} variant="secondary">
                              {p.entregue ? "ENTREGUE" : "EM ROTA"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Resumo */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">Total de pedidos</p>
                      <p className="text-2xl font-bold">{((carga as any).pedidos ?? []).length}</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-600">Entregues</p>
                      <p className="text-2xl font-bold text-green-700">
                        {((carga as any).pedidos ?? []).filter((p: any) => p.entregue).length}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600">Valor total</p>
                      <p className="text-2xl font-bold text-blue-700">
                        R$ {money(((carga as any).pedidos ?? []).reduce((sum: number, p: any) => sum + Number(p.total || 0), 0))}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation(`/cargas/${cargaId}`)}>
                      <Truck className="h-4 w-4" /> Abrir carga
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
