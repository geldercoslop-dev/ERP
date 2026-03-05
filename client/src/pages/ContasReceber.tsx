import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Search, Trash2, CheckCircle, Calendar, CreditCard, FileText, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isInProgress } from "@shared/idempotency";

export default function ContasReceber() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<'PENDENTE' | 'RECEBIDA'>('PENDENTE');
  const [showNovo, setShowNovo] = useState(false);
  const [showBaixa, setShowBaixa] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState<any>(null);

  const [novaConta, setNovaConta] = useState({
    clienteNome: "",
    pedidoNumero: "",
    valor: "",
    dataVencimento: new Date().toISOString().split('T')[0],
    descricao: ""
  });

  const { data: contas, isLoading } = trpc.contasReceber.list.useQuery({ status: statusFiltro });
  const { data: caixa } = trpc.caixaMensal.get.useQuery({});
  
  const createConta = trpc.contasReceber.create.useMutation();
  const marcarRecebida = trpc.contasReceber.marcarRecebida.useMutation();
  const createIdempotencyKeyRef = useRef<string | null>(null);
  const deleteConta = trpc.contasReceber.delete.useMutation();
  const gerarRelatorio = trpc.boletos.gerarRelatorio.useMutation();

  const handleCreate = async () => {
    try {
      if (!createIdempotencyKeyRef.current) {
        createIdempotencyKeyRef.current = `conta-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      }
      const valorNumber = Number(String(novaConta.valor ?? "").replace(/\./g, "").replace(",", "."));
      const res = await createConta.mutateAsync({
        ...novaConta,
        idempotencyKey: createIdempotencyKeyRef.current,
        pedidoNumero: novaConta.pedidoNumero ? Number(novaConta.pedidoNumero) : undefined,
        valor: valorNumber,
        dataVencimento: novaConta.dataVencimento,
      });
      if (isInProgress(res)) {
        toast({ title: "Processando", description: res.message ?? "Já está processando, aguarde…" });
        return;
      }
      createIdempotencyKeyRef.current = null;
      toast({ title: "Sucesso", description: "Conta lançada!" });
      setShowNovo(false);
      utils.contasReceber.list.invalidate();
    } catch (e: any) {
      createIdempotencyKeyRef.current = null;
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleBaixa = async (forma: 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO') => {
    try {
      await marcarRecebida.mutateAsync({
        id: contaSelecionada.id,
        formaPagamento: forma,
        dataRecebimento: new Date().toISOString(),
      });
      toast({ title: "Sucesso", description: "Baixa realizada com sucesso!" });
      setShowBaixa(false);
      utils.contasReceber.list.invalidate();
      utils.caixaMensal.get.invalidate();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleImprimirRelatorio = async () => {
    try {
      const mesAtual = new Date().toISOString().substring(0, 7);
      const pdfDataUri = await gerarRelatorio.mutateAsync({ tipo: 'RECEBER', mesAno: mesAtual });
      const link = document.createElement('a');
      link.href = pdfDataUri;
      link.download = `relatorio_receber_${mesAtual}.pdf`;
      link.click();
      toast({ title: "Sucesso", description: "Relatório gerado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleExportarExcel = () => {
    if (!contasFiltradas || contasFiltradas.length === 0) {
      toast({ title: "Aviso", description: "Não há dados para exportar." });
      return;
    }

    const headers = ["ID", "Cliente", "Pedido", "Descrição", "Valor", "Vencimento", "Status"];
    const rows = contasFiltradas.map(c => [
      c.id,
      c.clienteNome,
      c.pedidoNumero || "",
      c.descricao,
      Number(c.valor).toFixed(2),
      new Date(c.dataVencimento).toLocaleDateString('pt-BR'),
      c.status
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contas_receber_${statusFiltro.toLowerCase()}.csv`;
    link.click();
    toast({ title: "Sucesso", description: "Arquivo CSV gerado!" });
  };

  const contasFiltradas = contas?.filter(c => 
    c.clienteNome.toLowerCase().includes(busca.toLowerCase()) || 
    c.pedidoNumero?.toString().includes(busca)
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/financeiro")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Contas a Receber</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Controle de Entradas</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportarExcel} className="gap-2 border-slate-300">
              <Download className="h-4 w-4" /> EXCEL
            </Button>
            <Button variant="outline" size="sm" onClick={handleImprimirRelatorio} className="gap-2 border-slate-300">
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button size="sm" onClick={() => setShowNovo(true)} className="gap-2 bg-blue-700 hover:bg-blue-800">
              <Plus className="h-4 w-4" /> LANÇAR CONTA
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-5xl space-y-6">
        {/* Dashboard Rápido */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'PIX', val: caixa?.totalPix, color: 'text-teal-600' },
            { label: 'Boleto', val: caixa?.totalBoleto, color: 'text-blue-600' },
            { label: 'Cartão', val: caixa?.totalCartao, color: 'text-purple-600' },
            { label: 'Dinheiro', val: caixa?.totalDinheiro, color: 'text-green-600' },
            { label: 'Total Mês', val: caixa?.totalGeral, color: 'text-slate-900', bold: true }
          ].map((item, i) => (
            <Card key={i} className="border-slate-200 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase">{item.label}</p>
                <p className={`text-sm md:text-base font-black ${item.color}`}>
                  R$ {Number(item.val || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por cliente ou pedido..." 
              className="pl-10 bg-slate-50 border-slate-200"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <Tabs value={statusFiltro} onValueChange={(v: any) => setStatusFiltro(v)} className="w-full md:w-auto">
            <TabsList className="grid w-full grid-cols-2 bg-slate-100">
              <TabsTrigger value="PENDENTE">PENDENTES</TabsTrigger>
              <TabsTrigger value="RECEBIDA">RECEBIDAS</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Lista */}
        <div className="grid gap-3">
          {(isLoading ? [] : (contasFiltradas || [])).length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
              Nenhuma conta encontrada.
            </div>
          ) : (
            (isLoading ? [] : (contasFiltradas || [])).map(conta => (
              <Card key={conta.id} className="hover:shadow-md transition-shadow border-slate-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex gap-4 items-center">
                    <div className={`p-3 rounded-full ${conta.status === 'RECEBIDA' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{conta.clienteNome.toUpperCase()}</span>
                        {conta.pedidoNumero && <Badge variant="secondary" className="text-[10px]">#{conta.pedidoNumero}</Badge>}
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
                        <Button size="sm" onClick={() => { setContaSelecionada(conta); setShowBaixa(true); }} className="bg-green-600 hover:bg-green-700 gap-2">
                          <CheckCircle className="h-4 w-4" /> BAIXA
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={async () => {
                        if(confirm('Excluir esta conta?')) {
                          await deleteConta.mutateAsync({ id: conta.id });
                          utils.contasReceber.list.invalidate();
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

      {/* MODAL BAIXA */}
      <Dialog open={showBaixa} onOpenChange={setShowBaixa}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Dar Baixa no Recebimento</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-slate-100 p-3 rounded-lg text-center">
              <p className="text-xs text-slate-500 font-bold uppercase">Valor a Receber</p>
              <p className="text-2xl font-black text-blue-700">R$ {Number(contaSelecionada?.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
            </div>
            <p className="text-center text-sm font-bold text-slate-600">COMO O CLIENTE PAGOU?</p>
            <div className="grid grid-cols-2 gap-2">
              {['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO'].map(f => (
                <Button key={f} onClick={() => handleBaixa(f as any)} className="h-12 font-bold bg-slate-900 hover:bg-blue-700">{f}</Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL NOVA CONTA */}
      <Dialog open={showNovo} onOpenChange={setShowNovo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar Conta a Receber Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Nome do Cliente</Label>
              <Input value={novaConta.clienteNome} onChange={e => setNovaConta({...novaConta, clienteNome: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valor (R$)</Label>
                <Input value={novaConta.valor} onChange={e => setNovaConta({...novaConta, valor: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Vencimento</Label>
                <Input type="date" value={novaConta.dataVencimento} onChange={e => setNovaConta({...novaConta, dataVencimento: e.target.value})} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Descrição / Observação</Label>
              <Input value={novaConta.descricao} onChange={e => setNovaConta({...novaConta, descricao: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovo(false)}>CANCELAR</Button>
            <Button onClick={handleCreate} className="bg-blue-700 hover:bg-blue-800">SALVAR CONTA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
