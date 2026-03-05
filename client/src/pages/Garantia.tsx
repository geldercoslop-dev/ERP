import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, Search, CheckCircle, XCircle, Clock, Package, User, Hash, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpcClient";

export default function Garantia() {
  const [, setLocation] = useLocation();
  const [busca, setBusca] = useState("");
  const [pedidoSelecionadoId, setPedidoSelecionadoId] = useState<number | null>(null);

  const { data: pedidosData } = trpc.pedidos.list.useQuery();
  const pedidos = (pedidosData as any)?.items ?? [];
  const { data: itensPedido } = trpc.pedidos.getItens.useQuery(
    { pedidoId: pedidoSelecionadoId || 0 },
    { enabled: !!pedidoSelecionadoId }
  );

  const handleBuscar = () => {
    if (!busca.trim()) return;
    
    const termo = busca.toLowerCase();
    const pedidoEncontrado = pedidos?.find(p => 
      p.numero.toString().includes(termo) ||
      p.clienteNome?.toLowerCase().includes(termo)
    );
    
    if (pedidoEncontrado) {
      setPedidoSelecionadoId(pedidoEncontrado.id);
    } else {
      setPedidoSelecionadoId(null);
    }
  };

  const pedido = useMemo(() => 
    pedidos?.find(p => p.id === pedidoSelecionadoId), 
    [pedidos, pedidoSelecionadoId]
  );

  // Função para calcular garantia de um item específico
  const calcularGarantiaItem = (item: any, dataEntrega: Date | null) => {
    if (!dataEntrega) return { status: 'pendente', diasRestantes: null, fimGarantia: null };
    
    const entrega = new Date(dataEntrega);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const prazo = item.prazoGarantia || 90;
    const fimGarantia = new Date(entrega);
    fimGarantia.setDate(fimGarantia.getDate() + prazo);
    fimGarantia.setHours(0, 0, 0, 0);
    
    const diffTime = fimGarantia.getTime() - hoje.getTime();
    const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diasRestantes >= 0) {
      return { status: 'ativa', diasRestantes, fimGarantia };
    } else {
      return { status: 'expirada', diasRestantes: Math.abs(diasRestantes), fimGarantia };
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Consulta de Garantia</h1>
              <p className="text-sm text-muted-foreground">Prazos dinâmicos contados a partir da entrega</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-3xl">
        {/* Busca */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Número do pedido ou nome do cliente..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleBuscar} className="gap-2">
              Buscar
            </Button>
          </div>
        </div>

        {/* Resultado */}
        {pedido ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Informações do Pedido */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Dados do Cliente
                </h3>
                <p className="font-medium">{pedido.clienteNome}</p>
                <p className="text-sm text-muted-foreground">
                  {pedido.clienteCidade}/{pedido.clienteUf}
                </p>
              </div>

              <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Hash className="h-4 w-4 text-primary" /> Pedido #{pedido.numero}
                </h3>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-bold text-primary">{pedido.status}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Data Entrega:</span>
                  <span className="font-bold">
                    {pedido.dataEntrega ? new Date(pedido.dataEntrega).toLocaleDateString('pt-BR') : 'Pendente'}
                  </span>
                </div>
              </div>
            </div>

            {/* Itens do Pedido com Garantia Individual */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 bg-muted/50 border-b border-border">
                <h3 className="font-bold flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" /> Status por Item
                </h3>
              </div>
              <div className="divide-y divide-border">
                {itensPedido?.map((item) => {
                  const g = calcularGarantiaItem(item, pedido.dataEntrega ? new Date(pedido.dataEntrega) : null);
                  return (
                    <div key={item.id} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold">{item.descricao}</p>
                          <p className="text-xs text-muted-foreground">Prazo: {item.prazoGarantia || 90} dias</p>
                        </div>
                        <div className="text-right">
                          {g.status === 'ativa' && (
                            <div className="flex items-center gap-1 text-green-600 font-bold text-sm bg-green-50 px-2 py-1 rounded">
                              <CheckCircle className="h-3 w-3" /> ATIVA
                            </div>
                          )}
                          {g.status === 'expirada' && (
                            <div className="flex items-center gap-1 text-red-600 font-bold text-sm bg-red-50 px-2 py-1 rounded">
                              <XCircle className="h-3 w-3" /> FINALIZADA
                            </div>
                          )}
                          {g.status === 'pendente' && (
                            <div className="flex items-center gap-1 text-orange-600 font-bold text-sm bg-orange-50 px-2 py-1 rounded">
                              <Clock className="h-3 w-3" /> AGUARDANDO ENTREGA
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {g.status !== 'pendente' && g.fimGarantia && (
                        <div className="mt-3 flex items-center justify-between bg-muted/30 p-2 rounded text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Vencimento: {g.fimGarantia.toLocaleDateString('pt-BR')}</span>
                          </div>
                          <div className="font-bold">
                            {g.status === 'ativa' 
                              ? `${g.diasRestantes} dias restantes`
                              : `Vencida há ${g.diasRestantes} dias`}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!itensPedido || itensPedido.length === 0) && (
                  <div className="p-8 text-center text-muted-foreground italic">
                    Nenhum item no pedido.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : busca && (
          <div className="text-center py-16 bg-card rounded-xl border border-border shadow-sm">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-bold">Pedido não encontrado</h3>
            <p className="text-muted-foreground">Verifique o número ou o nome e tente novamente.</p>
          </div>
        )}

        {!pedido && !busca && (
          <div className="text-center py-20 bg-card rounded-xl border border-dashed border-border">
            <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-xl font-medium text-muted-foreground">Aguardando busca...</h3>
            <p className="text-muted-foreground">Informe os dados acima para verificar a garantia.</p>
          </div>
        )}
      </main>
    </div>
  );
}
