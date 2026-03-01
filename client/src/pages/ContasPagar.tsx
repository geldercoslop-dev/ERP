import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Search, Trash2, CheckCircle, Calendar, CreditCard, Settings, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ContasPagar() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<'PENDENTE' | 'PAGO'>('PENDENTE');
  const [showNovo, setShowNovo] = useState(false);
  const [showPlano, setShowPlano] = useState(false);
  const [showGerarFixas, setShowGerarFixas] = useState(false);
  const [mesGerar, setMesGerar] = useState(new Date().toISOString().substring(0, 7));

  // Form de Nova Conta
  const [novaConta, setNovaConta] = useState({
    fornecedor: "",
    descricao: "",
    valor: "",
    dataVencimento: new Date().toISOString().split('T')[0],
    planoContasId: undefined as number | undefined
  });

  // Form de Novo Plano de Contas
  const [novoPlano, setNovoPlano] = useState({ nome: "", tipo: 'SAIDA' as 'SAIDA' | 'ENTRADA' });

  // Queries e Mutations
  const { data: contas, isLoading } = trpc.contasPagar.list.useQuery({ status: statusFiltro, fornecedor: busca });
  const { data: planos } = trpc.planoContas.list.useQuery({ tipo: 'SAIDA' });
  
  const createConta = trpc.contasPagar.create.useMutation();
  const pagarConta = trpc.contasPagar.pagar.useMutation();
  const deleteConta = trpc.contasPagar.delete.useMutation();
  const createPlano = trpc.planoContas.create.useMutation();
  const gerarFixas = trpc.contasFixas.gerarMes.useMutation();
  const gerarRelatorio = trpc.boletos.gerarRelatorio.useMutation();

  const handleCreateConta = async () => {
    if (!novaConta.fornecedor || !novaConta.valor) return;
    try {
      await createConta.mutateAsync({
        ...novaConta,
        dataVencimento: new Date(novaConta.dataVencimento)
      });
      toast({ title: "Sucesso", description: "Conta lançada com sucesso!" });
      setShowNovo(false);
      utils.contasPagar.list.invalidate();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handlePagar = async (id: number, valor: string) => {
    const valorPago = prompt("Confirme o valor pago:", valor.replace('.', ','));
    if (!valorPago) return;
    
    try {
      await pagarConta.mutateAsync({ id, valorPago: parseFloat(valorPago.replace(',', '.')) });
      toast({ title: "Sucesso", description: "Pagamento registrado!" });
      utils.contasPagar.list.invalidate();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleGerarFixas = async () => {
    try {
      await gerarFixas.mutateAsync({ mesAno: mesGerar });
      toast({ title: "Sucesso", description: `Contas fixas de ${mesGerar} geradas!` });
      setShowGerarFixas(false);
      utils.contasPagar.list.invalidate();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleCreatePlano = async () => {
    if (!novoPlano.nome) return;
    try {
      await createPlano.mutateAsync(novoPlano);
      toast({ title: "Sucesso", description: "Categoria criada!" });
      setShowPlano(false);
      utils.planoContas.list.invalidate();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleImprimirRelatorio = async () => {
    try {
      const mesAtual = new Date().toISOString().substring(0, 7);
      const pdfDataUri = await gerarRelatorio.mutateAsync({ tipo: 'PAGAR', mesAno: mesAtual });
      const link = document.createElement('a');
      link.href = pdfDataUri;
      link.download = `relatorio_pagar_${mesAtual}.pdf`;
      link.click();
      toast({ title: "Sucesso", description: "Relatório gerado com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/financeiro")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Contas a Pagar</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Gestão Financeira</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleImprimirRelatorio} className="gap-2 border-slate-300">
              <FileText className="h-4 w-4" /> RELATÓRIO
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation('/contas-fixas')} className="gap-2 border-slate-300">
              <Settings className="h-4 w-4" /> FIXAS
            </Button>
            <Button size="sm" onClick={() => setShowNovo(true)} className="gap-2 bg-blue-700 hover:bg-blue-800">
              <Plus className="h-4 w-4" /> NOVA CONTA
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-5xl space-y-6">
        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por fornecedor..." 
              className="pl-10 bg-slate-50 border-slate-200"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <Tabs value={statusFiltro} onValueChange={(v: any) => setStatusFiltro(v)} className="w-full md:w-auto">
            <TabsList className="grid w-full grid-cols-2 bg-slate-100">
              <TabsTrigger value="PENDENTE">PENDENTES</TabsTrigger>
              <TabsTrigger value="PAGO">PAGAS</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Lista */}
        <div className="grid gap-3">
          {(isLoading ? [] : contas || []).length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
              Nenhuma conta encontrada para este filtro.
            </div>
          ) : (
            (isLoading ? [] : contas || []).map(conta => (
              <Card key={conta.id} className="hover:shadow-md transition-shadow border-slate-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex gap-4 items-center">
                    <div className={`p-3 rounded-full ${conta.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{conta.fornecedor.toUpperCase()}</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-500">
                          {planos?.find(p => p.id === conta.planoContasId)?.nome || 'Sem Categoria'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-slate-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {new Date(conta.dataVencimento).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-xs text-slate-400 italic">{conta.descricao}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-bold uppercase">Valor</p>
                      <p className="text-lg font-black text-slate-900">R$ {Number(conta.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                    </div>
                    
                    <div className="flex gap-2">
                      {conta.status === 'PENDENTE' && (
                        <Button size="sm" onClick={() => handlePagar(conta.id, conta.valor)} className="bg-green-600 hover:bg-green-700 gap-2">
                          <CheckCircle className="h-4 w-4" /> PAGAR
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={async () => {
                        if(confirm('Excluir esta conta?')) {
                          await deleteConta.mutateAsync({ id: conta.id });
                          utils.contasPagar.list.invalidate();
                        }
                      }} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      {/* MODAL NOVA CONTA */}
      <Dialog open={showNovo} onOpenChange={setShowNovo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar Nova Conta a Pagar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Fornecedor / Nome da Conta</Label>
              <Input value={novaConta.fornecedor} onChange={e => setNovaConta({...novaConta, fornecedor: e.target.value})} placeholder="Ex: Aluguel, Fornecedor X..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valor (R$)</Label>
                <Input value={novaConta.valor} onChange={e => setNovaConta({...novaConta, valor: e.target.value})} placeholder="0,00" />
              </div>
              <div className="grid gap-2">
                <Label>Vencimento</Label>
                <Input type="date" value={novaConta.dataVencimento} onChange={e => setNovaConta({...novaConta, dataVencimento: e.target.value})} />
              </div>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Categoria (Plano de Contas)</Label>
                <Button variant="link" size="sm" onClick={() => setShowPlano(true)} className="h-auto p-0 text-blue-600">+ Criar Nova</Button>
              </div>
              <Select onValueChange={(v) => setNovaConta({...novaConta, planoContasId: Number(v)})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {planos?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovo(false)}>CANCELAR</Button>
            <Button onClick={handleCreateConta} className="bg-blue-700 hover:bg-blue-800">SALVAR CONTA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL NOVO PLANO (JANELA RÁPIDA) */}
      <Dialog open={showPlano} onOpenChange={setShowPlano}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Nova Categoria Financeira</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Nome da Categoria</Label>
              <Input value={novoPlano.nome} onChange={e => setNovoPlano({...novoPlano, nome: e.target.value})} placeholder="Ex: Compras, Oficina, Aluguel..." />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreatePlano} className="w-full bg-slate-900">CADASTRAR CATEGORIA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL GERAR FIXAS */}
      <Dialog open={showGerarFixas} onOpenChange={setShowGerarFixas}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Gerar Contas Fixas do Mês</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-500">O sistema irá gerar todas as contas marcadas como fixas para o mês selecionado.</p>
            <div className="grid gap-2">
              <Label>Mês de Referência</Label>
              <Input type="month" value={mesGerar} onChange={e => setMesGerar(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGerarFixas(false)}>CANCELAR</Button>
            <Button onClick={handleGerarFixas} className="bg-blue-700 hover:bg-blue-800">GERAR CONTAS</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
