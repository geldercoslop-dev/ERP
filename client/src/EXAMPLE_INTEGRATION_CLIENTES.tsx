/**
 * EXEMPLO PRÁTICO: Integrar ClientesConnected com dados reais
 * 
 * Este arquivo mostra como migrar a tela de Clientes existente
 * para usar os novos serviços de API
 * 
 * ANTES: MockData ou tRPC legacy
 * DEPOIS: clientService com tipagem forte
 */

// ============================================================================
// ANTES: ClientesConnected.tsx (Estado original)
// ============================================================================

// import { trpc } from "../../lib/trpcClient";
// const qList = trpc.clientes.list.useQuery(undefined, { staleTime: 10_000 });

// Limitações:
// ❌ Dados podem ser mockados
// ❌ Sem estados específicos de loading/erro/vazio
// ❌ Sem validação de formulário
// ❌ acoplado ao tRPC

// ============================================================================
// DEPOIS: ClientesConnected.tsx (Estado integrado)
// ============================================================================

import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, UserPlus, Pencil, Trash2, Users } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { PageHeader } from "../../components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "../../components/layout/pageLayout";

// ✨ NOVOS IMPORTS
import { 
  listarClientes, 
  buscarClientes, 
  criarCliente, 
  atualizarCliente, 
  deletarCliente 
} from "../../services/clientService";
import { 
  useRequest, 
  Loading, 
  ErrorDisplay, 
  EmptyState 
} from "../../hooks/useRequest";
import { 
  ClienteCreateSchema, 
  validateData, 
  formatValidationErrors 
} from "../../schemas/validationSchemas";
import { useAuthContext } from "../../contexts/AuthContext";
import { maskPhoneBr, onlyDigits, maskCpf, maskCep } from "../../lib/masks";
import { toast } from "sonner";

import type { Cliente } from "../../types/cliente.types";

function upper(v: string) {
  return (v ?? "").toUpperCase();
}

function pick<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  keys.forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

export default function ClientesConnected() {
  const [location, setLocation] = useLocation();
  const params = useMemo(
    () => new URLSearchParams(location.includes("?") ? location.split("?")[1]! : ""),
    [location]
  );
  const modo = (params.get("modo") || "cadastro") as "cadastro" | "perfil";

  // ✨ Autenticação
  const { user, isAuthenticated } = useAuthContext();
  const isAdmin = user?.role === "admin";

  // ✨ Gerenciamento de dados
  const qList = useRequest<{ items: Cliente[]; total: number; page: number; pageSize: number; hasMore: boolean } | null>(null);

  // ✨ Mutation states
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ✨ Load initial data
  useEffect(() => {
    if (!isAuthenticated) return;
    loadClientes();
  }, [isAuthenticated]);

  const loadClientes = async () => {
    try {
      await qList.execute(() => listarClientes({ page: 1, pageSize: 100 }));
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
    }
  };

  // Filtros
  const [busca, setBusca] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    telefoneRecado: "",
    cpf: "",
    cep: "",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    uf: "",
    referencia: "",
  });

  function reset() {
    setForm({
      nome: "",
      telefone: "",
      telefoneRecado: "",
      cpf: "",
      cep: "",
      rua: "",
      numero: "",
      bairro: "",
      cidade: "",
      uf: "",
      referencia: "",
    });
    setEditId(null);
  }

  async function handleSave() {
    // ✨ Validar com Zod
    const { valid, errors } = validateData(ClienteCreateSchema, form);
    if (!valid) {
      formatValidationErrors(errors).forEach((err) => toast.error(err));
      return;
    }

    try {
      if (editId) {
        // ✨ Update
        setIsUpdating(true);
        await atualizarCliente(editId, form);
        toast.success("Cliente atualizado!");
      } else {
        // ✨ Create
        setIsCreating(true);
        await criarCliente(form);
        toast.success("Cliente criado!");
      }

      reset();
      await loadClientes();
    } catch (error) {
      console.error("Erro ao salvar:", error);
    } finally {
      setIsCreating(false);
      setIsUpdating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Tem certeza que deseja deletar?")) return;

    try {
      setIsDeleting(true);
      await deletarCliente(id);
      toast.success("Cliente deletado!");
      await loadClientes();
    } catch (error) {
      console.error("Erro ao deletar:", error);
    } finally {
      setIsDeleting(false);
    }
  }

  function loadForEdit(c: Cliente) {
    setEditId(c.id);
    setForm({
      nome: c.nome ?? "",
      telefone: maskPhoneBr(c.telefone ?? ""),
      telefoneRecado: maskPhoneBr(c.telefoneRecado ?? ""),
      cpf: maskCpf(c.cpf ?? ""),
      cep: maskCep(c.cep ?? ""),
      rua: c.rua ?? "",
      numero: c.numero ?? "",
      bairro: c.bairro ?? "",
      cidade: c.cidade ?? "",
      uf: c.uf ?? "",
      referencia: c.referencia ?? "",
    });
    setLocation("/clientes?modo=cadastro");
  }

  const listData = qList.data?.items ?? [];

  // ✨ Busca local
  const items = useMemo(() => {
    const term = upper(busca.trim());
    if (!term) return listData;
    return listData.filter((c) =>
      upper(c.nome ?? "").includes(term) ||
      (c.cpf ?? "").includes(term) ||
      (c.telefone ?? "").includes(term)
    );
  }, [listData, busca]);

  // ✨ Estados UI
  if (!isAuthenticated) {
    return <div>Faça login para acessar</div>;
  }

  if (qList.isLoading) {
    return (
      <div className={PAGE_WRAPPER}>
        <PageHeader title="Clientes" subtitle="Carregando..." />
        <main className={PAGE_MAIN}>
          <Loading>Carregando clientes...</Loading>
        </main>
      </div>
    );
  }

  if (qList.error) {
    return (
      <div className={PAGE_WRAPPER}>
        <PageHeader title="Clientes" subtitle="Erro" />
        <main className={PAGE_MAIN}>
          <ErrorDisplay 
            error={qList.error} 
            onRetry={loadClientes}
          />
        </main>
      </div>
    );
  }

  if (qList.isEmpty || items.length === 0) {
    return (
      <div className={PAGE_WRAPPER}>
        <PageHeader title="Clientes" subtitle="Nenhum cliente" />
        <main className={PAGE_MAIN}>
          <EmptyState
            title="Sem clientes"
            message="Nenhum cliente cadastrado ainda"
            action={
              <Button onClick={() => setLocation("/clientes?modo=cadastro")}>
                <UserPlus className="h-4 w-4 mr-2" />
                Novo Cliente
              </Button>
            }
          />
        </main>
      </div>
    );
  }

  // ✨ Render
  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader 
        title="Clientes" 
        subtitle={`Total: ${qList.data?.total || 0}`}
      />

      <main className={PAGE_MAIN}>
        {/* Busca */}
        <div className="mb-6 flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar por nome, CPF ou telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              icon={<Search className="h-4 w-4" />}
            />
          </div>
          <Button onClick={() => setLocation("/clientes?modo=cadastro")}>
            <UserPlus className="h-4 w-4 mr-2" />
            Novo
          </Button>
        </div>

        {/* Form - Cadastro */}
        {modo === "cadastro" && (
          <div className="mb-6 p-6 bg-slate-50 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">
              {editId ? `Editar Cliente #${editId}` : "Novo Cliente"}
            </h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Nome completo"
                  required
                />
              </div>

              <div>
                <Label>Telefone *</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: onlyDigits(e.target.value) })}
                  placeholder="11999999999"
                  required
                />
              </div>

              <div>
                <Label>CPF</Label>
                <Input
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: onlyDigits(e.target.value) })}
                  placeholder="00000000000"
                />
              </div>

              <div>
                <Label>CEP</Label>
                <Input
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: onlyDigits(e.target.value) })}
                  placeholder="00000000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input
                value={form.rua}
                onChange={(e) => setForm({ ...form, rua: e.target.value })}
                placeholder="Rua"
              />
              <Input
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                placeholder="Número"
              />
              <Input
                value={form.bairro}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                placeholder="Bairro"
              />
              <Input
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                placeholder="Cidade"
              />
            </div>

            <div className="flex gap-2 mb-4">
              <Button
                onClick={handleSave}
                disabled={isCreating || isUpdating}
                className="bg-green-600"
              >
                {isCreating || isUpdating ? "..." : editId ? "Atualizar" : "Criar"}
              </Button>
              <Button
                onClick={() => {
                  reset();
                  setLocation("/clientes?modo=cadastro");
                }}
                variant="outline"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 border-b">
              <tr>
                <th className="text-left p-4">Nome</th>
                <th className="text-left p-4">Telefone</th>
                <th className="text-left p-4">CPF</th>
                <th className="text-center p-4">Ações</th>
              </tr>
            </thead>

            <tbody>
              {items.map((cliente) => (
                <tr key={cliente.id} className="border-b hover:bg-slate-50">
                  <td className="p-4 font-medium">{cliente.nome}</td>
                  <td className="p-4">{cliente.telefone}</td>
                  <td className="p-4">{cliente.cpf}</td>
                  <td className="p-4 flex gap-2 justify-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadForEdit(cliente)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(cliente.id)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// RESUMO DAS MUDANÇAS
// ============================================================================

/**
 * ✨ MUDANÇAS IMPLEMENTADAS:
 * 
 * 1. Imports
 *    - Adicionar serviços: clientService
 *    - Adicionar hooks: useRequest, useAuthContext
 *    - Adicionar validação: ClienteCreateSchema
 *
 * 2. Estado Global
 *    - Usar useAuthContext para autenticação
 *    - Usar useRequest para gerenciar dados
 *
 * 3. Effects
 *    - useEffect que carrega dados ao montar
 *    - Verificar isAuthenticated
 *
 * 4. Handlers
 *    - handleSave() com validação Zod
 *    - handleDelete() com confirmação
 *    - loadClientes() para refresh
 *
 * 5. UI States
 *    - <Loading /> quando carregando
 *    - <ErrorDisplay /> quando erro
 *    - <EmptyState /> quando vazio
 *
 * 6. Tipos
 *    - Import Cliente do types/cliente.types
 *    - Usar tipos corretos em argumentos
 *
 * ════════════════════════════════════════════════════════════════════════
 * 
 * BENEFÍCIOS:
 * ✅ Dados reais da API
 * ✅ Tipagem forte
 * ✅ Validação robusta
 * ✅ Tratamento de erro
 * ✅ UX melhorada
 * ✅ Fácil de manter
 * ✅ Padrão reutilizável
 */
