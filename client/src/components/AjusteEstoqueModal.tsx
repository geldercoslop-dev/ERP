import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { trpc } from "../lib/trpcClient";
import { useToast } from "../hooks/use-toast";
import { ArrowUp, ArrowDown } from "lucide-react";

interface AjusteEstoqueModalProps {
  isOpen: boolean;
  onClose: () => void;
  produtoId: number;
  produtoNome: string;
  estoqueAtual: number;
}

export function AjusteEstoqueModal({
  isOpen,
  onClose,
  produtoId,
  produtoNome,
  estoqueAtual,
}: AjusteEstoqueModalProps) {
  const [quantidade, setQuantidade] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const ajusteMutation = trpc.ajusteEstoque.rapido.useMutation({
    onSuccess: () => {
      utils.produtos.list.invalidate();
      utils.pendencias.list.invalidate();
      toast({
        title: "Sucesso!",
        description: `${tipo === "entrada" ? "Entrada" : "Saída"} de ${quantidade} unidades registrada.`,
      });
      setQuantidade("");
      setTipo("entrada");
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleConfirm = () => {
    if (!quantidade || parseInt(quantidade) <= 0) {
      toast({
        title: "Erro",
        description: "Digite uma quantidade válida",
        variant: "destructive",
      });
      return;
    }

    ajusteMutation.mutate({
      produtoId,
      quantidade: Number(quantidade),
      tipo,
    });
  };

  const novoEstoque = tipo === "entrada" 
    ? estoqueAtual + (parseInt(quantidade) || 0)
    : estoqueAtual - (parseInt(quantidade) || 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⚡ Ajuste Rápido de Estoque
          </DialogTitle>
          <DialogDescription>
            {produtoNome}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de Ajuste */}
          <div className="flex gap-2">
            <Button
              variant={tipo === "entrada" ? "default" : "outline"}
              className="flex-1 gap-2"
              onClick={() => setTipo("entrada")}
            >
              <ArrowUp className="h-4 w-4" /> Entrada
            </Button>
            <Button
              variant={tipo === "saida" ? "destructive" : "outline"}
              className="flex-1 gap-2"
              onClick={() => setTipo("saida")}
            >
              <ArrowDown className="h-4 w-4" /> Saída
            </Button>
          </div>

          {/* Informações de Estoque */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-muted p-2 rounded text-center">
              <p className="text-muted-foreground text-xs">Estoque Atual</p>
              <p className="font-bold text-lg">{estoqueAtual}</p>
            </div>
            <div className="bg-primary/10 p-2 rounded text-center">
              <p className="text-muted-foreground text-xs">Novo Estoque</p>
              <p className={`font-bold text-lg ${novoEstoque < 0 ? "text-destructive" : ""}`}>
                {novoEstoque}
              </p>
            </div>
          </div>

          {/* Quantidade */}
          <div>
            <label className="text-sm font-medium">Quantidade</label>
            <Input
              type="number"
              placeholder="Digite a quantidade"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="mt-1"
              autoFocus
              min="1"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={ajusteMutation.isPending || !quantidade}
            >
              {ajusteMutation.isPending ? "Processando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
