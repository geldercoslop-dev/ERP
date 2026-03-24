import { useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";
import type { ClienteLocal } from "@/types/appDomain";
import { saveClientesMock, seedClientesIfEmpty } from "@/mocks/localClientesStore";
import { newLocalId } from "@/mocks/id";
import { toast } from "sonner";

/**
 * Cadastro e lista locais quando a API está offline (localStorage).
 */
export default function ClientesOfflinePanel() {
  const [items, setItems] = useState<ClienteLocal[]>(() => seedClientesIfEmpty());
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );

  function persist(next: ClienteLocal[]) {
    setItems(next);
    saveClientesMock(next);
  }

  function adicionar() {
    const n = nome.trim();
    if (!n) {
      toast.error("Informe o nome.");
      return;
    }
    const row: ClienteLocal = {
      id: newLocalId(),
      nome: n,
      telefone: telefone.trim(),
      endereco: endereco.trim(),
      createdAt: new Date().toISOString(),
    };
    persist([row, ...items]);
    setNome("");
    setTelefone("");
    setEndereco("");
    toast.success("Cliente salvo localmente (modo offline).");
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Clientes"
        subtitle="Modo offline — dados apenas neste navegador até a API voltar"
        icon={<Users className="h-5 w-5" />}
      />
      <div className={PAGE_MAIN}>
        <div className="bg-amber-50 border border-amber-200 text-amber-950 rounded-xl p-4 mb-6 text-sm">
          O servidor não respondeu. Você pode cadastrar e listar clientes localmente; ao reconectar, use a
          versão integrada para sincronizar com o sistema.
        </div>

        <div className="bg-white/95 text-slate-800 border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
          <div className="flex items-center gap-2 font-bold text-slate-900 mb-4">
            <UserPlus className="h-5 w-5" />
            Novo cliente
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="md:col-span-2">
              <Label>Endereço</Label>
              <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, cidade" />
            </div>
          </div>
          <Button className="mt-4" onClick={adicionar}>
            Salvar localmente
          </Button>
        </div>

        <div className="bg-white/95 border border-slate-200 rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-slate-900 mb-3">Lista ({sorted.length})</h3>
          <div className="divide-y rounded-xl border overflow-hidden">
            {sorted.length === 0 && (
              <div className="p-4 text-sm text-slate-500">Nenhum cliente local.</div>
            )}
            {sorted.map((c) => (
              <div key={c.id} className="p-3 text-sm">
                <div className="font-bold text-slate-900">{c.nome}</div>
                <div className="text-slate-600">{c.telefone || "—"}</div>
                <div className="text-slate-500 text-xs mt-1">{c.endereco || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
