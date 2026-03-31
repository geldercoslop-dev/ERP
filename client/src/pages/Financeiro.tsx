import { Button } from "../components/ui/button";
import { trpc } from "../lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, DollarSign, Check, Clock, History, Landmark, CreditCard, Receipt } from "lucide-react";
import { toast } from "sonner";

export default function Financeiro() {
  const [, setLocation] = useLocation();
  
  const { data: comissoes, refetch } = trpc.comissoes.list.useQuery();
  const marcarPaga = trpc.comissoes.marcarPaga.useMutation();
  
  const comissoesPendentes = comissoes?.filter(c => c.status === 'PENDENTE') || [];
  const comissoesPagas = comissoes?.filter(c => c.status === 'PAGA') || [];
  
  const totalPendente = comissoesPendentes.reduce(
    (sum, c) => sum + parseFloat(c.valorComissao.toString()),
    0
  );
  
  const totalPagoHoje = comissoesPagas
    .filter(c => {
      if (!c.dataPagamento) return false;
      const hoje = new Date().toDateString();
      const dataPag = new Date(c.dataPagamento).toDateString();
      return hoje === dataPag;
    })
    .reduce((sum, c) => sum + parseFloat(c.valorComissao.toString()), 0);
  
  const handleMarcarPaga = async (id: number) => {
    if (!confirm('Confirmar pagamento desta comissão?')) return;
    
    try {
      await marcarPaga.mutateAsync({ id });
      toast.success('Comissão marcada como paga!');
      refetch();
    } catch (error) {
      toast.error('Erro ao marcar comissão');
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
              <h1 className="text-xl font-bold">Financeiro</h1>
              <p className="text-sm text-muted-foreground">
                Gestão de comissões e pagamentos
              </p>
            </div>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setLocation('/financeiro/historico')}
            >
              <History className="h-4 w-4" />
              Histórico de Caixa
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container py-6 max-w-6xl">
        {/* Atalhos Rápidos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Button 
            variant="outline" 
            className="h-auto py-4 flex-col gap-2 bg-card hover:bg-primary/5 border-border"
            onClick={() => setLocation('/contas-receber')}
          >
            <Landmark className="h-6 w-6 text-blue-600" />
            <span>Contas a Receber</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-4 flex-col gap-2 bg-card hover:bg-primary/5 border-border"
            onClick={() => setLocation('/contas-pagar')}
          >
            <Receipt className="h-6 w-6 text-red-600" />
            <span>Contas a Pagar</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-4 flex-col gap-2 bg-card hover:bg-primary/5 border-border"
            onClick={() => setLocation("/boletos")}
          >
            <CreditCard className="h-6 w-6 text-purple-600" />
            <span>Gestão Boletos</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-4 flex-col gap-2 bg-card hover:bg-primary/5 border-border"
            onClick={() => setLocation('/contas-fixas')}
          >
            <Clock className="h-6 w-6 text-orange-600" />
            <span>Contas Fixas</span>
          </Button>
        </div>

        {/* Resumo Comissões */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <h3 className="font-semibold">Comissões A Pagar</h3>
            </div>
            <p className="text-3xl font-bold text-orange-600">
              R$ {totalPendente.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {comissoesPendentes.length} comissão(ões) pendente(s)
            </p>
          </div>
          
          <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="font-semibold">Pago Hoje</h3>
            </div>
            <p className="text-3xl font-bold text-green-600">
              R$ {totalPagoHoje.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {comissoesPagas.filter(c => {
                if (!c.dataPagamento) return false;
                const hoje = new Date().toDateString();
                return new Date(c.dataPagamento).toDateString() === hoje;
              }).length} pagamento(s)
            </p>
          </div>
          
          <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-semibold">Total Pago (Histórico)</h3>
            </div>
            <p className="text-3xl font-bold text-blue-600">
              R$ {comissoesPagas.reduce((sum, c) => sum + parseFloat(c.valorComissao.toString()), 0).toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {comissoesPagas.length} comissão(ões) pagas
            </p>
          </div>
        </div>

        {/* Comissões Pendentes */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Comissões a Pagar
          </h2>
          
          {comissoesPendentes.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-lg border border-border">
              <Check className="h-12 w-12 mx-auto mb-3 text-green-600" />
              <p className="text-lg font-semibold mb-1">Tudo em dia!</p>
              <p className="text-muted-foreground">Não há comissões pendentes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comissoesPendentes.map((comissao) => (
                <div
                  key={comissao.id}
                  className="bg-card rounded-lg border border-border p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">
                          Pedido #{comissao.pedidoId}
                        </h3>
                        <span className="status-badge status-pendente">PENDENTE</span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Valor da Venda</p>
                          <p className="font-semibold">
                            R$ {parseFloat(comissao.valorVenda.toString()).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Percentual</p>
                          <p className="font-semibold">
                            {parseFloat(comissao.percentualComissao.toString()).toFixed(0)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Comissão</p>
                          <p className="font-semibold text-orange-600">
                            R$ {parseFloat(comissao.valorComissao.toString()).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Data</p>
                          <p className="font-semibold">
                            {new Date(comissao.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => handleMarcarPaga(comissao.id)}
                      disabled={marcarPaga.isPending}
                      size="sm"
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Marcar como Paga
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comissões Pagas */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Check className="h-5 w-5" />
            Histórico de Pagamentos (Comissões)
          </h2>
          
          {comissoesPagas.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-lg border border-border">
              <p className="text-muted-foreground">Nenhum pagamento realizado ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comissoesPagas.slice(0, 20).map((comissao) => (
                <div
                  key={comissao.id}
                  className="bg-card rounded-lg border border-border p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">
                          Pedido #{comissao.pedidoId}
                        </h3>
                        <span className="status-badge status-paga">PAGA</span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Valor da Venda</p>
                          <p className="font-semibold">
                            R$ {parseFloat(comissao.valorVenda.toString()).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Comissão</p>
                          <p className="font-semibold text-green-600">
                            R$ {parseFloat(comissao.valorComissao.toString()).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Data Venda</p>
                          <p className="font-semibold">
                            {new Date(comissao.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Data Pagamento</p>
                          <p className="font-semibold">
                            {comissao.dataPagamento 
                              ? new Date(comissao.dataPagamento).toLocaleDateString('pt-BR')
                              : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
