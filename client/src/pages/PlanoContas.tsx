import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Edit, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PlanoContas() {
  const [, setLocation] = useLocation();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"DESPESA" | "RECEITA">("DESPESA");
  
  const { data: planos, refetch } = trpc.planoContas.list.useQuery({});
  const listaPlanos = planos?.items ?? [];
  const criar = trpc.planoContas.create.useMutation();
  const atualizar = trpc.planoContas.update.useMutation();
  
  const abrirDialog = (plano?: any) => {
    if (plano) {
      setEditando(plano);
      setNome(plano.nome);
      setTipo(plano.tipo);
    } else {
      setEditando(null);
      limparForm();
    }
    setDialogAberto(true);
  };
  
  const limparForm = () => {
    setNome('');
    setTipo('DESPESA');
  };
  
  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    
    try {
      const dados = {
        nome: nome.trim(),
        tipo,
      } as const;
      
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, ...dados });
        toast.success("Plano de contas atualizado!");
      } else {
        await criar.mutateAsync(dados);
        toast.success("Plano de contas cadastrado!");
      }
      
      setDialogAberto(false);
      limparForm();
      refetch();
    } catch (error) {
      toast.error("Erro ao salvar");
      console.error(error);
    }
  };
  
  const despesas = listaPlanos.filter((p) => p.tipo === "DESPESA");
  const receitas = listaPlanos.filter((p) => p.tipo === "RECEITA");
  
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Plano de Contas</h1>
              <p className="text-sm text-muted-foreground">
                Organize suas despesas e receitas
              </p>
            </div>
            <Button onClick={() => abrirDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Conta
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* DESPESAS */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="text-red-500">📉</span> DESPESAS ({despesas.length})
          </h2>
          {despesas.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-lg border border-border">
              <p className="text-muted-foreground">Nenhuma despesa cadastrada</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {despesas.map((plano) => (
                <div
                  key={plano.id}
                  className="bg-card rounded-lg border border-border p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold">{plano.nome}</h3>
                    </div>
                    <Button
                      onClick={() => abrirDialog(plano)}
                      variant="ghost"
                      size="sm"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RECEITAS */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="text-green-500">📈</span> RECEITAS ({receitas.length})
          </h2>
          {receitas.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-lg border border-border">
              <p className="text-muted-foreground">Nenhuma receita cadastrada</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {receitas.map((plano) => (
                <div
                  key={plano.id}
                  className="bg-card rounded-lg border border-border p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold">{plano.nome}</h3>
                    </div>
                    <Button
                      onClick={() => abrirDialog(plano)}
                      variant="ghost"
                      size="sm"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Exemplos */}
        {listaPlanos.length === 0 && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">💡 Exemplos de Plano de Contas:</h3>
            <div className="text-sm space-y-1">
              <p><strong>Despesas:</strong> Oficina, Montador, Aluguel, Energia, Água, Internet, Telefone, Combustível</p>
              <p><strong>Receitas:</strong> Vendas à Vista, Vendas a Prazo, Serviços</p>
            </div>
          </div>
        )}
      </main>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editando ? 'Editar Plano de Contas' : 'Novo Plano de Contas'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Oficina, Aluguel, Energia..."
              />
            </div>
            
            <div>
              <Label htmlFor="tipo">Tipo *</Label>
              <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESPESA">📉 Despesa</SelectItem>
                  <SelectItem value="RECEITA">📈 Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => setDialogAberto(false)}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={criar.isPending || atualizar.isPending}
              className="flex-1"
            >
              {criar.isPending || atualizar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
