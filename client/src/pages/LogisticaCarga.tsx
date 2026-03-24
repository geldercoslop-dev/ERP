import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { Truck, MapPin, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";

/**
 * Tela Gerar Carga (Logística): criar carga, informar cidade, data de entrega.
 * Número da carga é gerado automaticamente. Redireciona para detalhes da carga após criar.
 */
export default function LogisticaCarga() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [cidadeRota, setCidadeRota] = useState("");
  const [dataEntrega, setDataEntrega] = useState(new Date().toISOString().split("T")[0]);
  const [pedidosSelecionados, setPedidosSelecionados] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const { data: pedidosDisponiveisResp } = trpc.pedidos.listParaCarga.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const pedidosDisponiveis = useMemo(() => {
    return pedidosDisponiveisResp?.success ? pedidosDisponiveisResp.data : (pedidosDisponiveisResp as any)?.items ?? [];
  }, [pedidosDisponiveisResp]);
  const criarCarga = trpc.cargas.create.useMutation();

  const togglePedido = (id: number) => {
    setPedidosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleCriar = async () => {
    if (!cidadeRota.trim()) {
      toast({ title: "Erro", description: "Informe a cidade da rota.", variant: "destructive" });
      return;
    }
    if (pedidosSelecionados.length === 0) {
      toast({ title: "Erro", description: "Selecione ao menos um pedido.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const out = await criarCarga.mutateAsync({
        cidadeRota: cidadeRota.trim().toUpperCase(),
        dataEntrega: dataEntrega ? new Date(dataEntrega) : new Date(),
        pedidosIds: pedidosSelecionados,
      });
      const id = (out as any).id;
      toast({
        title: "Carga criada",
        description: `Carga #${(out as any).numero} criada para ${cidadeRota}. Redirecionando para editar roteiro.`,
      });
      utils.cargas.list.invalidate();
      utils.pedidos.listParaCarga.invalidate();
      if (id) setLocation(`/cargas/${id}`);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? "Falha ao criar carga", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Gerar Carga"
        subtitle="Criar nova carga de entrega: cidade, data e pedidos. Número gerado automaticamente."
        icon={<Truck className="h-5 w-5 text-primary" />}
        backTo="/logistica"
      />
      <main className={PAGE_MAIN + " space-y-6"}>
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-medium">Cidade / Rota</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={cidadeRota}
                    onChange={(e) => setCidadeRota(e.target.value.toUpperCase())}
                    placeholder="Ex: LINHARES - CENTRO"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-medium">Data da entrega</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    type="date"
                    value={dataEntrega}
                    onChange={(e) => setDataEntrega(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-medium">
                Pedidos na carga ({pedidosSelecionados.length} selecionados)
              </Label>
              <p className="text-sm text-muted-foreground">
                Apenas pedidos com status CONFERIDO aparecem. Cliente, bairro, cidade, valor e vendedor serão salvos na carga.
              </p>
              <div className="border rounded-lg divide-y max-h-[320px] overflow-y-auto">
                {pedidosDisponiveis.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground italic">
                    Nenhum pedido conferido disponível. Conferir pedidos antes de montar a carga.
                  </p>
                ) : (
                  pedidosDisponiveis.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer"
                      onClick={() => togglePedido(p.id)}
                    >
                      <Checkbox
                        checked={pedidosSelecionados.includes(p.id)}
                        onCheckedChange={() => togglePedido(p.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2 flex-wrap">
                          <span className="font-semibold text-sm">#{p.numero}</span>
                          <span className="font-semibold text-sm">
                            R$ {Number(p.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{p.clienteNome}</p>
                        {(p.clienteBairro || p.clienteCidade) && (
                          <p className="text-xs text-muted-foreground">
                            {[p.clienteBairro, p.clienteCidade].filter(Boolean).join(" — ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLocation("/logistica")}>
                Cancelar
              </Button>
              <Button
                onClick={handleCriar}
                disabled={loading || pedidosSelecionados.length === 0}
                className="gap-2"
              >
                {loading ? "Criando..." : "Gerar carga"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
