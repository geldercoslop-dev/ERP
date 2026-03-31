import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { trpc } from "../lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Save, X, Calculator, ShieldCheck } from "lucide-react";
import { useToast } from "../hooks/use-toast";

export default function GruposPrecificacao() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: grupos, isLoading } = trpc.gruposPrecificacao.list.useQuery();
  const createMutation = trpc.gruposPrecificacao.create.useMutation({
    onSuccess: () => {
      utils.gruposPrecificacao.list.invalidate();
      setIsAdding(false);
      toast({ title: "Sucesso", description: "Grupo criado com sucesso!" });
    }
  });
  const updateMutation = trpc.gruposPrecificacao.update.useMutation({
    onSuccess: () => {
      utils.gruposPrecificacao.list.invalidate();
      setEditingId(null);
      toast({ title: "Sucesso", description: "Grupo atualizado!" });
    }
  });
  const deleteMutation = trpc.gruposPrecificacao.delete.useMutation({
    onSuccess: () => {
      utils.gruposPrecificacao.list.invalidate();
      toast({ title: "Sucesso", description: "Grupo excluído!" });
    }
  });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    nome: "",
    descontoFabrica: 0,
    ipi: 0,
    frete: 0,
    montagem: 0,
    lucro: 0,
    comissao: 0,
    jurosCartao: 0,
    prazoGarantia: 90
  });

  const handleEdit = (grupo: any) => {
    setEditingId(grupo.id);
    setFormData({
      nome: grupo.nome,
      descontoFabrica: Number(grupo.descontoFabrica),
      ipi: Number(grupo.ipi),
      frete: Number(grupo.frete),
      montagem: Number(grupo.montagem),
      lucro: Number(grupo.lucro),
      comissao: Number(grupo.comissao),
      jurosCartao: Number(grupo.jurosCartao),
      prazoGarantia: grupo.prazoGarantia
    });
  };

  const handleSave = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/cadastros")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Grupos de Precificação</h1>
            <p className="text-sm text-muted-foreground">Configure as regras de cálculo e garantia por grupo</p>
          </div>
          <Button onClick={() => { setIsAdding(true); setEditingId(null); setFormData({
            nome: "", descontoFabrica: 0, ipi: 0, frete: 0, montagem: 0, lucro: 0, comissao: 0, jurosCartao: 0, prazoGarantia: 90
          }); }} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Grupo
          </Button>
        </div>
      </header>

      <main className="container py-6">
        {(isAdding || editingId) && (
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm mb-6 animate-in fade-in slide-in-from-top-4">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              {editingId ? 'Editar Grupo' : 'Novo Grupo de Precificação'}
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="text-xs font-bold uppercase text-muted-foreground">Nome do Grupo (ex: Roupeiro, Sofá)</label>
                <Input value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} placeholder="Nome do grupo" />
              </div>
              
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Desc. Fábrica (%)</label>
                <Input type="number" value={formData.descontoFabrica} onChange={e => setFormData({...formData, descontoFabrica: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">IPI (%)</label>
                <Input type="number" value={formData.ipi} onChange={e => setFormData({...formData, ipi: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Frete (R$)</label>
                <Input type="number" value={formData.frete} onChange={e => setFormData({...formData, frete: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Montagem (R$)</label>
                <Input type="number" value={formData.montagem} onChange={e => setFormData({...formData, montagem: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Lucro (R$)</label>
                <Input type="number" value={formData.lucro} onChange={e => setFormData({...formData, lucro: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Comissão (%)</label>
                <Input type="number" value={formData.comissao} onChange={e => setFormData({...formData, comissao: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Juros Cartão (%)</label>
                <Input type="number" value={formData.jurosCartao} onChange={e => setFormData({...formData, jurosCartao: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Garantia (Dias)
                </label>
                <Input type="number" value={formData.prazoGarantia} onChange={e => setFormData({...formData, prazoGarantia: Number(e.target.value)})} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => { setIsAdding(false); setEditingId(null); }}>Cancelar</Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="h-4 w-4" /> Salvar Grupo
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {grupos?.map(grupo => (
            <div key={grupo.id} className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg">{grupo.nome}</h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(grupo)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate({ id: grupo.id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span>Desc. Fábrica:</span>
                  <span className="font-medium text-foreground">{grupo.descontoFabrica}%</span>
                </div>
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span>IPI:</span>
                  <span className="font-medium text-foreground">{grupo.ipi}%</span>
                </div>
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span>Frete:</span>
                  <span className="font-medium text-foreground">R$ {Number(grupo.frete).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span>Montagem:</span>
                  <span className="font-medium text-foreground">R$ {Number(grupo.montagem).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span>Lucro:</span>
                  <span className="font-medium text-foreground">R$ {Number(grupo.lucro).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 py-1">
                  <span>Comissão:</span>
                  <span className="font-medium text-foreground">{grupo.comissao}%</span>
                </div>
                <div className="flex justify-between py-1 col-span-2 text-primary font-bold">
                  <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Garantia:</span>
                  <span>{grupo.prazoGarantia} dias</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
