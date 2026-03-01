import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ContasFixas() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  
  const [showNovo, setShowNovo] = useState(false);
  const [novaFixa, setNovaFixa] = useState({
    nome: "",
    valorPadrao: "0.01",
    diaVencimento: 10,
    planoContasId: undefined as number | undefined
  });

  const { data: fixas, isLoading } = trpc.contasFixas.list.useQuery();
  const { data: planos } = trpc.planoContas.list.useQuery({ tipo: 'SAIDA' });
  const createFixa = trpc.contasFixas.create.useMutation();

  const handleCreate = async () => {
    if (!novaFixa.nome) return;
    try {
      await createFixa.mutateAsync(novaFixa);
      toast({ title: "Sucesso", description: "Conta fixa cadastrada!" });
      setShowNovo(false);
      utils.contasFixas.list.invalidate();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/contas-pagar")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Configurar Contas Fixas</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Automação Mensal</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowNovo(true)} className="gap-2 bg-slate-900">
            <Plus className="h-4 w-4" /> NOVA FIXA
          </Button>
        </div>
      </header>

      <main className="container py-6 max-w-4xl space-y-6">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex gap-4 items-start">
          <Settings className="h-6 w-6 text-blue-600 mt-1" />
          <div>
            <p className="font-bold text-blue-900">O que são Contas Fixas?</p>
            <p className="text-sm text-blue-700">São contas que se repetem todo mês (Aluguel, Água, Luz). Você as cadastra aqui com um valor padrão (ex: 0,01) e o sistema gera elas automaticamente para você no Contas a Pagar todo mês.</p>
          </div>
        </div>

        <div className="grid gap-4">
          {(isLoading ? [] : fixas || []).length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
              Nenhuma conta fixa cadastrada.
            </div>
          ) : (
            (isLoading ? [] : fixas || []).map(fixa => (
              <Card key={fixa.id} className="border-slate-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{fixa.nome.toUpperCase()}</p>
                    <p className="text-sm text-slate-500">Vence todo dia {fixa.diaVencimento} | Valor Base: R$ {Number(fixa.valorPadrao).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      <Dialog open={showNovo} onOpenChange={setShowNovo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Nova Conta Fixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Nome da Despesa</Label>
              <Input value={novaFixa.nome} onChange={e => setNovaFixa({...novaFixa, nome: e.target.value})} placeholder="Ex: Aluguel, Energia, Internet..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valor Padrão (R$)</Label>
                <Input value={novaFixa.valorPadrao} onChange={e => setNovaFixa({...novaFixa, valorPadrao: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Dia do Vencimento</Label>
                <Input type="number" min="1" max="31" value={novaFixa.diaVencimento} onChange={e => setNovaFixa({...novaFixa, diaVencimento: Number(e.target.value)})} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Categoria (Plano de Contas)</Label>
              <Select onValueChange={(v) => setNovaFixa({...novaFixa, planoContasId: Number(v)})}>
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
            <Button onClick={handleCreate} className="bg-slate-900">SALVAR FIXA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
