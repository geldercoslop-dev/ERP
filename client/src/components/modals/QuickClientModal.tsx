import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";
import { onlyDigits } from "@/lib/masks";

interface QuickClientModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickClientModal({ isOpen, onClose }: QuickClientModalProps) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    cidade: "",
  });

  const createMutation = trpc.clientes.create.useMutation({
    onSuccess: (_data: unknown, _variables: unknown) => {
      toast.success("Cliente cadastrado com sucesso!");
      utils.clientes.list.invalidate();
      onClose();
      setForm({ nome: "", telefone: "", cidade: "" });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao cadastrar cliente"),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.nome || !form.telefone) {
      toast.error("Nome e telefone são obrigatórios");
      return;
    }
    createMutation.mutate({
      nome: form.nome.toUpperCase(),
      telefone: onlyDigits(form.telefone),
      cidade: form.cidade.toUpperCase(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Novo Cliente Rápido
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: JOÃO DA SILVA"
              className="rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cidade">Cidade</Label>
              <Input
                id="cidade"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                placeholder="Ex: SÃO PAULO"
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="rounded-xl gap-2">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Cadastrar Cliente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
