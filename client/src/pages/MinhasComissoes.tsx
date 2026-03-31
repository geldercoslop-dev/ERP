import { Button } from "../components/ui/button";
import { trpc } from "../lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, DollarSign, Clock, Check } from "lucide-react";

export default function MinhasComissoes() {
  const [, setLocation] = useLocation();
  
  const { data: comissoes, isLoading } = trpc.comissoes.list.useQuery();
  
  const comissoesPendentes = (isLoading ? [] : comissoes?.filter(c => c.status === 'PENDENTE')) || [];
  const comissoesPagas = (isLoading ? [] : comissoes?.filter(c => c.status === 'PAGA')) || [];
  
  const totalPendente = comissoesPendentes.reduce(
    (sum, c) => sum + parseFloat(c.valorComissao.toString()),
    0
  );
  
  const totalRecebido = comissoesPagas.reduce(
    (sum, c) => sum + parseFloat(c.valorComissao.toString()),
    0
  );
  
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
              <h1 className="text-xl font-bold">Minhas Comissões</h1>
              <p className="text-sm text-muted-foreground">
                Acompanhe seus ganhos
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container py-6">
        {/* Resumo */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">A Receber</h3>
            </div>
            <p className="text-4xl font-bold mb-1">
              R$ {totalPendente.toFixed(2)}
            </p>
            <p className="text-white/80 text-sm">
              {comissoesPendentes.length} comissão(ões) pendente(s)
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">Total Recebido</h3>
            </div>
            <p className="text-4xl font-bold mb-1">
              R$ {totalRecebido.toFixed(2)}
            </p>
            <p className="text-white/80 text-sm">
              {comissoesPagas.length} comissão(ões) pagas
            </p>
          </div>
        </div>

        {/* Comissões Pendentes */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-600" />
            Aguardando Pagamento
          </h2>
          
          {comissoesPendentes.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-lg border border-border">
              <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-lg font-semibold mb-1">Nenhuma comissão pendente</p>
              <p className="text-muted-foreground">
                Suas comissões aparecerão aqui após as entregas
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {comissoesPendentes.map((comissao) => (
                <div
                  key={comissao.id}
                  className="bg-card rounded-lg border border-orange-200 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">
                        Pedido #{comissao.pedidoId}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(comissao.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className="status-badge status-pendente">PENDENTE</span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-center bg-muted/50 rounded-lg p-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Valor da Venda</p>
                      <p className="font-semibold">
                        R$ {parseFloat(comissao.valorVenda.toString()).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Percentual</p>
                      <p className="font-semibold">
                        {parseFloat(comissao.percentualComissao.toString()).toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Sua Comissão</p>
                      <p className="font-bold text-orange-600 text-lg">
                        R$ {parseFloat(comissao.valorComissao.toString()).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comissões Pagas */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            Histórico de Recebimentos
          </h2>
          
          {comissoesPagas.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-lg border border-border">
              <p className="text-muted-foreground">Nenhum recebimento ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comissoesPagas.map((comissao) => (
                <div
                  key={comissao.id}
                  className="bg-card rounded-lg border border-green-200 p-4"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-semibold">
                        Pedido #{comissao.pedidoId}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Venda: {new Date(comissao.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                      {comissao.dataPagamento && (
                        <p className="text-sm text-green-600 font-medium">
                          Pago em: {new Date(comissao.dataPagamento).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="status-badge status-paga mb-2 inline-block">PAGA</span>
                      <p className="font-bold text-green-600 text-xl">
                        R$ {parseFloat(comissao.valorComissao.toString()).toFixed(2)}
                      </p>
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
