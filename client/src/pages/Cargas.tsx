import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Truck, Calendar, MapPin, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

export default function Cargas() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  
  const [showNovo, setShowNovo] = useState(false);
  const [busca, setBusca] = useState("");
  const [cidadeRota, setCidadeRota] = useState("");
  const [dataEntrega, setDataEntrega] = useState(new Date().toISOString().split('T')[0]);
  const [pedidosSelecionados, setPedidosSelecionados] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  // Queries
  const { data: cargas, isLoading: loadingCargas } = trpc.cargas.list.useQuery();
  const { data: pedidosDisponiveis } = trpc.pedidos.list.useQuery({ status: "IMPRESSO" });
  const criarCarga = trpc.cargas.create.useMutation();

  const formatMoney = (v: any) => {
    const n = typeof v === 'string' ? Number(v) : Number(v || 0);
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  };

  const badgeCarga = (status: string) => {
    if (status === 'ENTREGUE') return <Badge className="bg-green-600">ENTREGUE</Badge>;
    if (status === 'ABERTA') return <Badge className="bg-yellow-500 text-black">ABERTA</Badge>;
    return <Badge className="bg-[#a855f7]">EM ROTA</Badge>;
  };

  const togglePedido = (id: number) => {
    setPedidosSelecionados(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSalvarCarga = async () => {
    if (!cidadeRota || pedidosSelecionados.length === 0) {
      toast({ title: "Erro", description: "Informe a rota e selecione ao menos um pedido", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await criarCarga.mutateAsync({
        cidadeRota,
        dataEntrega: new Date(dataEntrega),
        pedidosIds: pedidosSelecionados
      });
      toast({ title: "Carga montada", description: `Carga criada para ${cidadeRota}. ${pedidosSelecionados.length} pedido(s) adicionados. Pronta para liberar. ✅` });
      setShowNovo(false);
      setCidadeRota("");
      setPedidosSelecionados([]);
      utils.cargas.list.invalidate();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Gestão de Cargas</h1>
          </div>
          <Button onClick={() => setShowNovo(true)} className="gap-2">
            <Plus className="h-4 w-4" /> NOVA CARGA
          </Button>
        </div>
      </header>

      <main className="container py-6 max-w-5xl space-y-6">
        <div className="bg-card border rounded-lg p-4">
          <Label className="font-bold">BUSCAR CARGA</Label>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Digite: cidade / nº carga / nome do cliente"
            className="mt-2"
          />
        </div>
        {!loadingCargas && (cargas?.length === 0) ? (
          <div className="text-center py-20 bg-card border rounded-lg">
            <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma carga cadastrada.</p>
            <Button variant="link" onClick={() => setShowNovo(true)}>Criar primeira carga</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {(loadingCargas ? [] : (cargas || []))
              .filter((carga: any) => {
                const term = busca.trim().toLowerCase();
                if (!term) return true;
                const numero = String(carga.numero || '').toLowerCase();
                const cidade = String(carga.cidadeRota || '').toLowerCase();
                const clientes = String((carga as any).clientesResumo || '').toLowerCase();
                return numero.includes(term) || cidade.includes(term) || clientes.includes(term);
              })
              .map((carga: any) => (
              <Card key={carga.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLocation(`/cargas/${carga.id}`)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-full">
                      <Truck className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">CARGA #{carga.numero}</span>
                        {badgeCarga(String((carga as any).status))}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {String((carga as any).cidadeRota || '').toUpperCase()}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {(carga as any).dataEntrega ? new Date((carga as any).dataEntrega).toLocaleDateString() : '-'}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs mt-2">
                        <span className="font-bold">TOTAL: R$ {formatMoney((carga as any).valorTotal)}</span>
                        <span className="text-muted-foreground">PROGRESSO: <span className="font-bold">{(carga as any).entregues || 0}/{(carga as any).totalPedidos || 0}</span></span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* MODAL NOVA CARGA */}
      <Dialog open={showNovo} onOpenChange={setShowNovo}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Criar Nova Carga de Entrega</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4 overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-bold">ROTA / CIDADE</Label>
                <Input value={cidadeRota} onChange={e => setCidadeRota(e.target.value.toUpperCase())} placeholder="Ex: LINHARES - CENTRO" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold">DATA DA ENTREGA</Label>
                <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="font-bold">SELECIONAR PEDIDOS (DISPONÍVEIS: {pedidosDisponiveis?.length || 0})</Label>
              <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                {pedidosDisponiveis?.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground italic">Nenhum pedido com status IMPRESSO disponível.</p>
                ) : (
                  pedidosDisponiveis?.map(p => (
                    <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer" onClick={() => togglePedido(p.id)}>
                      <Checkbox checked={pedidosSelecionados.includes(p.id)} onCheckedChange={() => togglePedido(p.id)} />
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-bold text-sm">PEDIDO #{p.numero}</span>
                          <span className="font-bold text-sm">R$ {Number(p.total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        </div>
                        <p className="text-xs text-muted-foreground uppercase">{p.clienteNome}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowNovo(false)}>CANCELAR</Button>
            <Button onClick={handleSalvarCarga} disabled={loading || pedidosSelecionados.length === 0} className="bg-green-600 hover:bg-green-700">
              {loading ? "CRIANDO..." : "SALVAR CARGA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
