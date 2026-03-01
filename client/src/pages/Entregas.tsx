import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Truck, Package, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Entregas() {
  const [, setLocation] = useLocation();
  const [dialogNovaCarga, setDialogNovaCarga] = useState(false);
  const [dialogBaixa, setDialogBaixa] = useState(false);
  const [cargaSelecionada, setCargaSelecionada] = useState<any>(null);
  
  // Nova carga
  const [dataEntrega, setDataEntrega] = useState("");
  const [cidadeRota, setCidadeRota] = useState("");
  
  // Adicionar pedido
  const [numeroPedido, setNumeroPedido] = useState("");
  
  // Dar baixa
  const [formasPagamento, setFormasPagamento] = useState<Record<number, string>>({});
  
  const { data: cargas, refetch: refetchCargas } = trpc.cargas.list.useQuery();
  const { data: pedidosCarga, refetch: refetchPedidos } = trpc.cargas.getPedidos.useQuery(
    { cargaId: cargaSelecionada?.id || 0 },
    { enabled: !!cargaSelecionada }
  );
  
  const criarCarga = trpc.cargas.create.useMutation();
  const adicionarPedido = trpc.cargas.addPedido.useMutation();
  const darBaixa = trpc.cargas.darBaixa.useMutation();
  const deletarCarga = trpc.cargas.delete.useMutation();
  
  const cargasAbertas = cargas?.filter(c => c.status === 'ABERTA') || [];
  const cargasBaixadas = cargas?.filter(c => c.status === 'BAIXADA') || [];
  
  const handleCriarCarga = async () => {
    if (!dataEntrega) {
      toast.error("Data de entrega \u00e9 obrigat\u00f3ria");
      return;
    }
    
    try {
      await criarCarga.mutateAsync({
        dataEntrega: dataEntrega,
        cidadeRota: cidadeRota || undefined,
      });
      
      toast.success("Carga criada com sucesso!");
      setDialogNovaCarga(false);
      setDataEntrega("");
      setCidadeRota("");
      refetchCargas();
    } catch (error) {
      toast.error("Erro ao criar carga");
      console.error(error);
    }
  };
  
  const handleAdicionarPedido = async () => {
    if (!cargaSelecionada || !numeroPedido) {
      toast.error("Informe o número do pedido");
      return;
    }
    
    try {
      await adicionarPedido.mutateAsync({
        cargaId: cargaSelecionada.id,
        numeroPedido: parseInt(numeroPedido),
      });
      
      toast.success("Pedido adicionado à carga!");
      setNumeroPedido("");
      refetchPedidos();
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar pedido");
      console.error(error);
    }
  };
  
  const handleDarBaixa = async () => {
    if (!cargaSelecionada || !pedidosCarga) return;
    
    const entregas = pedidosCarga.map(p => ({
      pedidoId: p.pedidoId,
      formaPagamento: formasPagamento[p.pedidoId] || 'DINHEIRO',
    }));
    
    if (entregas.length === 0) {
      toast.error("Adicione pedidos à carga antes de dar baixa");
      return;
    }
    
    try {
      await darBaixa.mutateAsync({
        cargaId: cargaSelecionada.id,
        entregas,
      });
      
      toast.success("Baixa realizada! Comissões geradas automaticamente.");
      setDialogBaixa(false);
      setCargaSelecionada(null);
      setFormasPagamento({});
      refetchCargas();
    } catch (error) {
      toast.error("Erro ao dar baixa");
      console.error(error);
    }
  };
  
  const handleDeletarCarga = async (carga: any) => {
    if (!confirm(`Tem certeza que deseja excluir a carga #${String(carga.numero).padStart(5, '0')}?`)) {
      return;
    }
    
    try {
      await deletarCarga.mutateAsync({ id: carga.id, numero: carga.numero });
      toast.success("Carga excluída!");
      refetchCargas();
    } catch (error) {
      toast.error("Erro ao excluir carga");
      console.error(error);
    }
  };
  
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Entregas e Cargas</h1>
              <p className="text-sm text-muted-foreground">
                {cargasAbertas.length} carga(s) aberta(s)
              </p>
            </div>
            <Button onClick={() => setDialogNovaCarga(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Carga
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container py-6 max-w-6xl">
        {/* Cargas Abertas */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Cargas Abertas
          </h2>
          
          {cargasAbertas.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-lg border border-border">
              <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma carga aberta</p>
              <Button onClick={() => setDialogNovaCarga(true)} className="mt-4" size="sm">
                Criar Primeira Carga
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {cargasAbertas.map(carga => (
                <div
                  key={carga.id}
                  className="bg-card rounded-lg border border-border p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">
                        Carga #{String(carga.numero).padStart(5, '0')}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Entrega: {carga.dataEntrega ? new Date(carga.dataEntrega).toLocaleDateString('pt-BR') : 'N/A'}
                      </p>
                      {carga.cidadeRota && (
                        <p className="text-sm text-muted-foreground">Rota: {carga.cidadeRota}</p>
                      )}
                    </div>
                    <span className="status-badge status-gerado">ABERTA</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setCargaSelecionada(carga)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      Gerenciar
                    </Button>
                    <Button
                      onClick={() => {
                        setCargaSelecionada(carga);
                        setDialogBaixa(true);
                      }}
                      size="sm"
                      className="flex-1 gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Dar Baixa
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cargas Baixadas */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Check className="h-5 w-5" />
            Cargas Finalizadas
          </h2>
          
          {cargasBaixadas.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-lg border border-border">
              <p className="text-muted-foreground">Nenhuma carga finalizada ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cargasBaixadas.slice(0, 10).map(carga => (
                <div
                  key={carga.id}
                  className="bg-card rounded-lg border border-border p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">
                        Carga #{String(carga.numero).padStart(5, '0')}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Entrega: {carga.dataEntrega ? new Date(carga.dataEntrega).toLocaleDateString('pt-BR') : 'N/A'}
                      </p>
                    </div>
                    <span className="status-badge status-entregue">BAIXADA</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Dialog: Nova Carga */}
      <Dialog open={dialogNovaCarga} onOpenChange={setDialogNovaCarga}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Carga</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="dataEntrega">Data de Entrega *</Label>
              <Input
                id="dataEntrega"
                type="date"
                value={dataEntrega}
                onChange={(e) => setDataEntrega(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="cidadeRota">Cidade/Rota (opcional)</Label>
              <Input
                id="cidadeRota"
                value={cidadeRota}
                onChange={(e) => setCidadeRota(e.target.value)}
                placeholder="Ex: São Paulo - Zona Sul"
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => setDialogNovaCarga(false)}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCriarCarga}
              disabled={criarCarga.isPending}
              className="flex-1"
            >
              {criarCarga.isPending ? 'Criando...' : 'Criar Carga'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Gerenciar Carga */}
      <Dialog open={!!cargaSelecionada && !dialogBaixa} onOpenChange={(open) => !open && setCargaSelecionada(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Carga #{cargaSelecionada ? String(cargaSelecionada.numero).padStart(5, '0') : ''}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Adicionar Pedido */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <Label htmlFor="numeroPedido">Adicionar Pedido</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="numeroPedido"
                  type="number"
                  value={numeroPedido}
                  onChange={(e) => setNumeroPedido(e.target.value)}
                  placeholder="Número do pedido"
                  className="flex-1"
                />
                <Button
                  onClick={handleAdicionarPedido}
                  disabled={adicionarPedido.isPending}
                >
                  {adicionarPedido.isPending ? '...' : 'Adicionar'}
                </Button>
              </div>
            </div>
            
            {/* Lista de Pedidos */}
            <div>
              <h3 className="font-semibold mb-2">Pedidos na Carga</h3>
              {!pedidosCarga || pedidosCarga.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum pedido adicionado ainda
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {pedidosCarga.map(pedido => (
                    <div
                      key={pedido.pedidoId}
                      className="flex items-center justify-between p-3 border border-border rounded"
                    >
                      <div>
                        <p className="font-semibold">
                          Pedido #{String(pedido.numeroPedido).padStart(5, '0')}
                        </p>
                        <p className="text-sm text-muted-foreground">{pedido.clienteNome}</p>
                      </div>
                      <p className="font-semibold">
                        R$ {parseFloat(pedido.valorTotal.toString()).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => handleDeletarCarga(cargaSelecionada)}
              variant="outline"
              className="text-red-600"
            >
              Excluir Carga
            </Button>
            <Button
              onClick={() => setCargaSelecionada(null)}
              variant="outline"
              className="flex-1"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Dar Baixa */}
      <Dialog open={dialogBaixa} onOpenChange={setDialogBaixa}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dar Baixa na Carga</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Marque a forma de pagamento de cada pedido. As comissões serão geradas automaticamente.
            </p>
            
            {pedidosCarga && pedidosCarga.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {pedidosCarga.map(pedido => (
                  <div
                    key={pedido.pedidoId}
                    className="border border-border rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold">
                          Pedido #{String(pedido.numeroPedido).padStart(5, '0')}
                        </p>
                        <p className="text-sm text-muted-foreground">{pedido.clienteNome}</p>
                      </div>
                      <p className="font-semibold">
                        R$ {parseFloat(pedido.valorTotal.toString()).toFixed(2)}
                      </p>
                    </div>
                    
                    <div>
                      <Label className="text-xs">Forma de Pagamento</Label>
                      <Select
                        value={formasPagamento[pedido.pedidoId] || 'DINHEIRO'}
                        onValueChange={(value) => setFormasPagamento({
                          ...formasPagamento,
                          [pedido.pedidoId]: value,
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                          <SelectItem value="PIX">PIX</SelectItem>
                          <SelectItem value="CARTAO_CREDITO">Cartão de Crédito</SelectItem>
                          <SelectItem value="CARTAO_DEBITO">Cartão de Débito</SelectItem>
                          <SelectItem value="BOLETO">Boleto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                Adicione pedidos à carga antes de dar baixa
              </p>
            )}
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => setDialogBaixa(false)}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDarBaixa}
              disabled={darBaixa.isPending || !pedidosCarga || pedidosCarga.length === 0}
              className="flex-1 gap-2"
            >
              {darBaixa.isPending ? 'Processando...' : (
                <>
                  <Check className="h-4 w-4" />
                  Confirmar Baixa
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
