import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpcClient";
import { toast } from "sonner";

export default function Cores() {
  const [, setLocation] = useLocation();
  const [novaCor, setNovaCor] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");

  const { data: cores, refetch } = trpc.cores.list.useQuery();
  const criarCor = trpc.cores.create.useMutation();
  const atualizarCor = trpc.cores.update.useMutation();
  const deletarCor = trpc.cores.delete.useMutation();

  const handleCriar = async () => {
    if (!novaCor.trim()) {
      toast.error('Digite o nome da cor');
      return;
    }

    try {
      await criarCor.mutateAsync({ nome: novaCor.trim() });
      toast.success('Cor cadastrada com sucesso!');
      setNovaCor("");
      refetch();
    } catch (error) {
      toast.error('Erro ao cadastrar cor');
      console.error(error);
    }
  };

  const handleAtualizar = async (id: number) => {
    if (!nomeEditado.trim()) {
      toast.error('Digite o nome da cor');
      return;
    }

    try {
      await atualizarCor.mutateAsync({ id, nome: nomeEditado.trim() });
      toast.success('Cor atualizada com sucesso!');
      setEditandoId(null);
      setNomeEditado("");
      refetch();
    } catch (error) {
      toast.error('Erro ao atualizar cor');
      console.error(error);
    }
  };

  const handleDeletar = async (id: number) => {
    if (!confirm('Deseja realmente excluir esta cor?')) return;

    try {
      await deletarCor.mutateAsync({ id });
      toast.success('Cor excluída com sucesso!');
      refetch();
    } catch (error) {
      toast.error('Erro ao excluir cor');
      console.error(error);
    }
  };

  const iniciarEdicao = (id: number, nome: string) => {
    setEditandoId(id);
    setNomeEditado(nome);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/cadastros")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Cores</h1>
              <p className="text-sm text-muted-foreground">
                Gerenciar cores dos produtos
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container py-6 max-w-4xl">
        {/* Formulário de Nova Cor */}
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Cadastrar Nova Cor</h2>
          <div className="flex gap-2">
            <Input
              placeholder="Nome da cor (ex: Preto, Branco, Azul)"
              value={novaCor}
              onChange={(e) => setNovaCor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCriar()}
              className="flex-1"
            />
            <Button onClick={handleCriar} disabled={criarCor.isPending} className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </div>

        {/* Lista de Cores */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Cores Cadastradas</h2>
            <p className="text-sm text-muted-foreground">
              {cores?.length || 0} cor(es) no sistema
            </p>
          </div>

          {cores && cores.length > 0 ? (
            <div className="divide-y divide-border">
              {cores.map((cor) => (
                <div key={cor.id} className="p-4 flex items-center justify-between gap-4">
                  {editandoId === cor.id ? (
                    <>
                      <Input
                        value={nomeEditado}
                        onChange={(e) => setNomeEditado(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAtualizar(cor.id)}
                        className="flex-1"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAtualizar(cor.id)}
                          disabled={atualizarCor.isPending}
                        >
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditandoId(null);
                            setNomeEditado("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="font-semibold">{cor.nome}</p>
                        <p className="text-sm text-muted-foreground">ID: {cor.id}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => iniciarEdicao(cor.id, cor.nome)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeletar(cor.id)}
                          disabled={deletarCor.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhuma cor cadastrada ainda</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
