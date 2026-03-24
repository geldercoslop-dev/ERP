import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { toast } from "sonner";
import { Package, Loader2 } from "lucide-react";

interface QuickProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickProductModal({ isOpen, onClose }: QuickProductModalProps) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    descricao: "",
    marca: "",
    custo: 0,
    valorVenda: 0,
  });

  const createMutation = trpc.produtos.create.useMutation({
    onSuccess: () => {
      toast.success("Produto cadastrado com sucesso!");
      utils.produtos.list.invalidate();
      onClose();
      setForm({ descricao: "", marca: "", custo: 0, valorVenda: 0 });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao cadastrar produto"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao) {
      toast.error("Descrição é obrigatória");
      return;
    }
    createMutation.mutate(form as any);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Novo Produto Rápido
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Input
              id="descricao"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value.toUpperCase() })}
              placeholder="Ex: ROUPEIRO FLORENÇA"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="marca">Marca</Label>
            <Input
              id="marca"
              value={form.marca}
              onChange={(e) => setForm({ ...form, marca: e.target.value.toUpperCase() })}
              placeholder="Ex: PANAN"
              className="rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="custo">Custo (R$)</Label>
              <Input
                id="custo"
                type="number"
                value={form.custo}
                onChange={(e) => setForm({ ...form, custo: Number(e.target.value) })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venda">Venda (R$)</Label>
              <Input
                id="venda"
                type="number"
                value={form.valorVenda}
                onChange={(e) => setForm({ ...form, valorVenda: Number(e.target.value) })}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="rounded-xl gap-2">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              Cadastrar Produto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
